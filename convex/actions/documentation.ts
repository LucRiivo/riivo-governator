"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { callClaude } from "../lib/claude";
// Use require to avoid circular type dependency with api.ts
const { api } = require("../_generated/api") as any;

import { markdownToStorage } from "../lib/markdownToStorage";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Actions (Claude & Confluence) ---

export const generateDocumentation = action({
    args: { flowId: v.id("flows"), tenantId: v.string() },
    handler: async (ctx, args) => {
        // 1. Fetch Flow Data (Internal)
        const flow = await ctx.runQuery(api.queries.getFlowById, { flowId: args.flowId });
        if (!flow) throw new Error("Flow not found");

        let clientData = flow.clientData ? JSON.parse(flow.clientData) : null;

        if (!clientData) {
            throw new Error("Flow definition not found. Please run 'Audit Logic' first to fetch latest definition.");
        }

        const prompt: string = `
You are an expert Business Analyst documenting Power Automate flows for non-technical stakeholders.
Your goal is to explain WHAT the process does and WHY, avoiding technical jargon like "initialize variable", "compose", or JSON paths.

**CRITICAL: Output ONLY valid Markdown. Do NOT start with "Here is the documentation" or "Sure". Start directly with the Metadata Table.**

Flow Name: ${flow.name}
Flow Definition (JSON):
${JSON.stringify(clientData, null, 2)}

Instructions:
1.  **Metadata Table**: Start with a Markdown table containing the following columns:
    *   **Automation Name**: ${flow.name}
    *   **Link to Automation in Dev**: [Automation Link](https://make.powerautomate.com/) (Placeholder, or use actual link if known)
    *   **State**: **ACTIVE** (or relevant status)
    *   **Description**: A 1-sentence summary of what it does.
    *   **Trigger**: What triggers this flow.

2.  **High-level Diagram**:
    *   Generate a high-level flowchart using **Mermaid.js** syntax.
    *   Wrap it in a markdown code block with the language identifier \`mermaid\`.
    *   Keep it simple and focused on business logic.

3.  **Concise Pseudocode Logic with Embedded Notes**:
    *   Write a **numbered list** of the flow's logic.
    *   **CRITICAL: INTEGRATE** important notes, warnings, and business rules directly into this list, immediately following the relevant step. Do NOT create a separate "Important Notes" section at the end.
    *   Use a **pseudocode style**.
    *   Use the following Callout syntax for these embedded notes (place them nested under the relevant list item):
        *   \`> [!INFO] Title\` for general information.
        *   \`> [!NOTE] Title\` for neutral notes.
        *   \`> [!WARNING] Title\` for warnings or critical business rules.
        *   \`> [!SUCCESS] Title\` for good things.
        *   \`> [!ERROR] Title\` for bad things.
    *   Be extremely **concise**. Avoid long paragraphs.
    *   Use bolding for key decisions.

4.  **APIs / External Services**: List any APIs or connectors used.

Output Format: Markdown.
`;

        // 2. Call Claude API
        console.log(`[generateDocumentation] Calling Claude API...`);
        const { text: generatedText } = await callClaude(prompt, { maxTokens: 4096 });

        if (!generatedText) throw new Error("Claude returned empty content.");

        return generatedText;
    },
});

export const publishToConfluence = action({
    args: {
        flowId: v.id("flows"),
        title: v.string(),
        content: v.string(), // Markdown
        parentPageId: v.optional(v.string()), // Override parent page from settings
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");

        const settings = await ctx.runQuery(api.queries.getConfluenceSettingsByUserId, { userId: identity.tokenIdentifier });

        if (!settings || !settings.spaceKey) {
            throw new Error("Confluence settings incomplete. Please configure Domain, Email, Token, and Space Key.");
        }

        const { domain, email, apiToken, spaceKey, parentId } = settings;
        const sanitizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
        const baseUrl = `https://${sanitizedDomain}/wiki/api/v2`;

        // 1. Get Space ID from Space Key
        const spaceRes = await fetch(`${baseUrl}/spaces?keys=${spaceKey}`, {
            headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
        });

        if (!spaceRes.ok) {
            throw new Error(`Failed to fetch Space ID for key '${spaceKey}': ${spaceRes.status}`);
        }
        const spaceData = await spaceRes.json();
        if (spaceData.results.length === 0) {
            throw new Error(`Space with key '${spaceKey}' not found.`);
        }
        const spaceId = spaceData.results[0].id;

        // 2. Convert Markdown to Confluence Storage Format
        const storageBody = markdownToStorage(args.content);

        // Add Title Header
        const fullBody = `
            <p><strong>Flow Documentation: ${args.title}</strong></p>
            <hr/>
            ${storageBody}
            <p><em>Published via Governator</em></p>
        `;

        // 3. Check if page already exists for this flow (via our DB)
        // using api.documentation.getDocumentation
        const doc = await ctx.runQuery(api.documentation.getDocumentation, { flowId: args.flowId });
        const existingPageId = doc?.confluencePageId;

        let pageId = existingPageId;
        let finalUrl = "";

        if (existingPageId) {
            // Update Flow
            // We need current version number to update
            const pageRes = await fetch(`${baseUrl}/pages/${existingPageId}`, {
                headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
            });

            if (pageRes.ok) {
                const pageData = await pageRes.json();
                const newVersion = pageData.version.number + 1;

                const response = await fetch(`${baseUrl}/pages/${existingPageId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        id: existingPageId,
                        status: 'current',
                        title: args.title,
                        body: {
                            representation: 'storage',
                            value: fullBody
                        },
                        version: {
                            number: newVersion,
                            message: "Flow updated via Governator"
                        }
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Failed to update page: ${response.status} ${errText}`);
                }

                const resultData = await response.json();
                finalUrl = `https://${sanitizedDomain}/wiki${resultData._links.webui}`;

            } else {
                throw new Error(`Failed to fetch existing page ${existingPageId}. It might have been deleted.`);
            }
        } else {
            // Create New Page
            const createBody: any = {
                spaceId: spaceId,
                status: 'current',
                title: args.title,
                body: {
                    representation: 'storage',
                    value: fullBody
                }
            };

            // Add parentId — user override takes precedence over settings
            const effectiveParentId = args.parentPageId || parentId;
            if (effectiveParentId) {
                createBody.parentId = effectiveParentId;
            }

            const response = await fetch(`${baseUrl}/pages`, {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(createBody)
            });

            if (!response.ok) {
                const errText = await response.text();
                if (response.status === 404 || errText.toLowerCase().includes("parent")) {
                    throw new Error(`The selected parent page may no longer exist or you don't have access. Please choose a different page. (${response.status})`);
                }
                throw new Error(`Confluence API Error: ${response.status} ${errText}`);
            }

            const resultData = await response.json();
            pageId = resultData.id;
            finalUrl = `https://${sanitizedDomain}/wiki${resultData._links.webui}`;
        }

        // 4. Update DB
        if (pageId) {
            // using api.documentation.saveDocumentation
            await ctx.runMutation(api.documentation.saveDocumentation, {
                flowId: args.flowId,
                content: args.content,
                status: 'published',
                confluencePageId: pageId,
                confluenceUrl: finalUrl
            });
        }

        return { success: true, url: finalUrl };
    }
});

// --- Bulk Documentation Actions ---

const GENERATE_BATCH_SIZE = 5;
const GENERATE_BATCH_DELAY_MS = 2000;
const PUBLISH_BATCH_SIZE = 3;
const PUBLISH_BATCH_DELAY_MS = 1500;
const ACTION_TIME_LIMIT_MS = 8 * 60 * 1000; // 8 min — leave 2 min buffer before Convex 10 min timeout

const DOC_PROMPT_TEMPLATE = (flowName: string, clientDataJson: string) => `
You are an expert Business Analyst documenting Power Automate flows for non-technical stakeholders.
Your goal is to explain WHAT the process does and WHY, avoiding technical jargon like "initialize variable", "compose", or JSON paths.

**CRITICAL: Output ONLY valid Markdown. Do NOT start with "Here is the documentation" or "Sure". Start directly with the Metadata Table.**

Flow Name: ${flowName}
Flow Definition (JSON):
${clientDataJson}

Instructions:
1.  **Metadata Table**: Start with a Markdown table containing the following columns:
    *   **Automation Name**: ${flowName}
    *   **Link to Automation in Dev**: [Automation Link](https://make.powerautomate.com/)
    *   **State**: **ACTIVE** (or relevant status)
    *   **Description**: A 1-sentence summary of what it does.
    *   **Trigger**: What triggers this flow.

2.  **High-level Diagram**:
    *   Generate a high-level flowchart using **Mermaid.js** syntax.
    *   Wrap it in a markdown code block with the language identifier \`mermaid\`.
    *   Keep it simple and focused on business logic.

3.  **Concise Pseudocode Logic with Embedded Notes**:
    *   Write a **numbered list** of the flow's logic.
    *   **CRITICAL: INTEGRATE** important notes, warnings, and business rules directly into this list.
    *   Use a **pseudocode style**.
    *   Use Callout syntax: \`> [!INFO]\`, \`> [!NOTE]\`, \`> [!WARNING]\`, \`> [!SUCCESS]\`, \`> [!ERROR]\`
    *   Be extremely **concise**. Use bolding for key decisions.

4.  **APIs / External Services**: List any APIs or connectors used.

Output Format: Markdown.
`;

async function generateSingleDocContent(flow: any): Promise<string> {
    const clientData = flow.clientData ? JSON.parse(flow.clientData) : null;
    if (!clientData) throw new Error("No flow definition");

    const prompt = DOC_PROMPT_TEMPLATE(flow.name, JSON.stringify(clientData, null, 2));
    const { text } = await callClaude(prompt, { maxTokens: 4096 });
    if (!text) throw new Error("Claude returned empty content.");
    return text;
}

export const startBulkDocumentation = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
        regenerateExisting: v.optional(v.boolean()),
        parentPageId: v.optional(v.string()), // Override parent page from settings
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");

        // Check for already-running job
        const existingJob = await ctx.runQuery(api.queries.getBulkDocJob, { tenantId: args.tenantId });
        if (existingJob && existingJob.status === "running") {
            throw new Error("A bulk documentation job is already running for this tenant.");
        }

        // Get all flows
        const allFlows = await ctx.runQuery(api.queries.getFlows, { tenantId: args.tenantId });
        if (allFlows.length === 0) {
            throw new Error("No flows found. Please sync flows first.");
        }

        // Create job
        const jobId = await ctx.runMutation(api.mutations.createBulkDocJob, {
            tenantId: args.tenantId,
            totalFlows: allFlows.length,
            requestedBy: identity.tokenIdentifier,
        });

        // Phase 1: Fetch missing definitions
        console.log(`[startBulkDocumentation] Phase 1: Fetching missing flow definitions...`);
        await ctx.runMutation(api.mutations.updateBulkDocJobPhase, { jobId, phase: "fetching" });
        try {
            await ctx.runAction(api.actions.bulkFetchFlowDefinitions, {
                tenantId: args.tenantId,
                orgId: args.orgId,
            });
        } catch (err: any) {
            console.error(`[startBulkDocumentation] Fetch phase error: ${err.message}`);
        }

        // Phase 2: Generate documentation
        console.log(`[startBulkDocumentation] Phase 2: Generating documentation...`);
        await ctx.runMutation(api.mutations.updateBulkDocJobPhase, { jobId, phase: "generating" });

        const updatedFlows = await ctx.runQuery(api.queries.getFlows, { tenantId: args.tenantId });

        // Get existing docs
        const existingDocIds = new Set<string>();
        for (const flow of updatedFlows) {
            const doc = await ctx.runQuery(api.documentation.getDocumentation, { flowId: flow._id });
            if (doc) existingDocIds.add(flow._id.toString());
        }

        let completed = 0;
        let failed = 0;
        let skipped = 0;
        const startTime = Date.now();

        // Filter flows
        const flowsToProcess = updatedFlows.filter((flow: any) => {
            if (!flow.clientData) {
                skipped++;
                return false;
            }
            if (!args.regenerateExisting && existingDocIds.has(flow._id.toString())) {
                skipped++;
                return false;
            }
            return true;
        });

        if (skipped > 0) {
            await ctx.runMutation(api.mutations.updateBulkDocJobProgress, { jobId, skippedFlows: skipped });
        }

        // Process in batches
        for (let i = 0; i < flowsToProcess.length; i += GENERATE_BATCH_SIZE) {
            if (Date.now() - startTime > ACTION_TIME_LIMIT_MS) {
                console.warn(`[startBulkDocumentation] Approaching time limit at ${completed} completed.`);
                break;
            }

            const job = await ctx.runQuery(api.queries.getBulkDocJobById, { jobId });
            if (job?.status === "cancelled") break;

            const batch = flowsToProcess.slice(i, i + GENERATE_BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(async (flow: any) => {
                    const content = await generateSingleDocContent(flow);
                    await ctx.runMutation(api.documentation.saveDocumentation, {
                        flowId: flow._id,
                        content,
                        status: "draft",
                    });
                    return flow;
                })
            );

            const batchErrors: { flowId: string; flowName: string; phase: string; error: string }[] = [];
            for (let j = 0; j < results.length; j++) {
                if (results[j].status === "fulfilled") {
                    completed++;
                } else {
                    failed++;
                    batchErrors.push({
                        flowId: batch[j]._id,
                        flowName: batch[j].name,
                        phase: "generate",
                        error: (results[j] as PromiseRejectedResult).reason?.message || "Unknown error",
                    });
                }
            }

            await ctx.runMutation(api.mutations.updateBulkDocJobProgress, {
                jobId,
                completedFlows: completed,
                failedFlows: failed,
                newErrors: batchErrors.length > 0 ? batchErrors : undefined,
            });

            if (i + GENERATE_BATCH_SIZE < flowsToProcess.length) {
                await sleep(GENERATE_BATCH_DELAY_MS);
            }
        }

        console.log(`[startBulkDocumentation] Generation done: ${completed} completed, ${failed} failed, ${skipped} skipped`);

        // Phase 3: Publish to Confluence
        console.log(`[startBulkDocumentation] Phase 3: Publishing to Confluence...`);
        await ctx.runMutation(api.mutations.updateBulkDocJobPhase, { jobId, phase: "publishing" });

        let published = 0;
        const settings = await ctx.runQuery(api.queries.getConfluenceSettingsByUserId, { userId: identity.tokenIdentifier });

        if (!settings || !settings.spaceKey) {
            console.warn(`[startBulkDocumentation] No Confluence settings — skipping publish.`);
            await ctx.runMutation(api.mutations.updateBulkDocJobProgress, {
                jobId,
                newErrors: [{
                    flowId: "N/A",
                    flowName: "Confluence Settings",
                    phase: "publish",
                    error: "No Confluence settings configured. Documentation saved as drafts only.",
                }],
            });
        } else {
            const { domain, email, apiToken, spaceKey, parentId } = settings;
            const sanitizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
            const baseUrl = `https://${sanitizedDomain}/wiki/api/v2`;

            // Get space ID
            let spaceId: string | null = null;
            try {
                const spaceRes = await fetch(`${baseUrl}/spaces?keys=${spaceKey}`, {
                    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
                });
                if (spaceRes.ok) {
                    const spaceData = await spaceRes.json();
                    if (spaceData.results.length > 0) spaceId = spaceData.results[0].id;
                }
            } catch (err: any) {
                console.error(`[startBulkDocumentation] Failed to fetch space ID: ${err.message}`);
            }

            if (!spaceId) {
                console.warn(`[startBulkDocumentation] Could not resolve Confluence space — skipping publish.`);
            } else {
                // Get all flows with docs to publish
                const flowsWithDocs: { flow: any; doc: any }[] = [];
                for (const flow of updatedFlows) {
                    const doc = await ctx.runQuery(api.documentation.getDocumentation, { flowId: flow._id });
                    if (doc && doc.content) flowsWithDocs.push({ flow, doc });
                }

                let authFailed = false;

                for (let i = 0; i < flowsWithDocs.length && !authFailed; i += PUBLISH_BATCH_SIZE) {
                    if (Date.now() - startTime > ACTION_TIME_LIMIT_MS) break;

                    const job = await ctx.runQuery(api.queries.getBulkDocJobById, { jobId });
                    if (job?.status === "cancelled") break;

                    const batch = flowsWithDocs.slice(i, i + PUBLISH_BATCH_SIZE);

                    const publishResults = await Promise.allSettled(
                        batch.map(async ({ flow, doc }) => {
                            const storageBody = markdownToStorage(doc.content);
                            const fullBody = `<p><strong>Flow Documentation: ${flow.name}</strong></p><hr/>${storageBody}<p><em>Published via Governator</em></p>`;

                            let pageId = doc.confluencePageId;
                            let finalUrl = "";

                            if (pageId) {
                                const pageRes = await fetch(`${baseUrl}/pages/${pageId}`, {
                                    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
                                });
                                if (pageRes.ok) {
                                    const pageData = await pageRes.json();
                                    const response = await fetch(`${baseUrl}/pages/${pageId}`, {
                                        method: 'PUT',
                                        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                        body: JSON.stringify({
                                            id: pageId, status: 'current', title: flow.name,
                                            body: { representation: 'storage', value: fullBody },
                                            version: { number: pageData.version.number + 1, message: "Bulk update via Governator" },
                                        }),
                                    });
                                    if (!response.ok) throw new Error(`Update page ${response.status}: ${await response.text()}`);
                                    const resultData = await response.json();
                                    finalUrl = `https://${sanitizedDomain}/wiki${resultData._links.webui}`;
                                } else if (pageRes.status === 404) {
                                    pageId = null; // Page deleted — create new
                                } else {
                                    throw new Error(`Fetch page ${pageRes.status}`);
                                }
                            }

                            if (!pageId) {
                                const createBody: any = {
                                    spaceId, status: 'current', title: flow.name,
                                    body: { representation: 'storage', value: fullBody },
                                };
                                const effectiveParentId = args.parentPageId || parentId;
                                if (effectiveParentId) createBody.parentId = effectiveParentId;
                                const response = await fetch(`${baseUrl}/pages`, {
                                    method: 'POST',
                                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                    body: JSON.stringify(createBody),
                                });
                                if (!response.ok) throw new Error(`Create page ${response.status}: ${await response.text()}`);
                                const resultData = await response.json();
                                pageId = resultData.id;
                                finalUrl = `https://${sanitizedDomain}/wiki${resultData._links.webui}`;
                            }

                            if (pageId) {
                                await ctx.runMutation(api.documentation.saveDocumentation, {
                                    flowId: flow._id, content: doc.content, status: 'published',
                                    confluencePageId: pageId, confluenceUrl: finalUrl,
                                });
                            }
                        })
                    );

                    const publishErrors: { flowId: string; flowName: string; phase: string; error: string }[] = [];
                    for (let j = 0; j < publishResults.length; j++) {
                        if (publishResults[j].status === "fulfilled") {
                            published++;
                        } else {
                            const errMsg = (publishResults[j] as PromiseRejectedResult).reason?.message || "Unknown error";
                            if (errMsg.includes("401") || errMsg.includes("403")) {
                                authFailed = true;
                            }
                            failed++;
                            publishErrors.push({
                                flowId: batch[j].flow._id,
                                flowName: batch[j].flow.name,
                                phase: "publish",
                                error: errMsg,
                            });
                        }
                    }

                    await ctx.runMutation(api.mutations.updateBulkDocJobProgress, {
                        jobId, publishedFlows: published, failedFlows: failed,
                        newErrors: publishErrors.length > 0 ? publishErrors : undefined,
                    });

                    if (i + PUBLISH_BATCH_SIZE < flowsWithDocs.length) {
                        await sleep(PUBLISH_BATCH_DELAY_MS);
                    }
                }
            }
        }

        console.log(`[startBulkDocumentation] Publish done: ${published} published`);

        const finalJob = await ctx.runQuery(api.queries.getBulkDocJobById, { jobId });
        const finalStatus = finalJob?.status === "cancelled"
            ? "cancelled"
            : (failed > 0 && completed === 0) ? "failed" : "completed";

        await ctx.runMutation(api.mutations.completeBulkDocJob, { jobId, status: finalStatus });

        return { jobId, completed, published, failed, skipped };
    },
});
