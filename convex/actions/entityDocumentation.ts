"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { callClaude } from "../lib/claude";
import { markdownToStorage } from "../lib/markdownToStorage";
const { api } = require("../_generated/api") as any;

// --- Shared Confluence Publish Helper ---

async function publishToConfluenceHelper(
    ctx: any,
    args: {
        title: string;
        content: string;
        parentPageId?: string;
        existingPageId?: string;
        existingUrl?: string;
    },
    saveFn: (pageId: string, url: string) => Promise<void>
): Promise<{ success: boolean; url: string }> {
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

    // Get Space ID
    const spaceRes = await fetch(`${baseUrl}/spaces?keys=${spaceKey}`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });
    if (!spaceRes.ok) throw new Error(`Failed to fetch Space ID for key '${spaceKey}': ${spaceRes.status}`);
    const spaceData = await spaceRes.json();
    if (spaceData.results.length === 0) throw new Error(`Space with key '${spaceKey}' not found.`);
    const spaceId = spaceData.results[0].id;

    // Convert to Confluence format
    const storageBody = markdownToStorage(args.content);
    const fullBody = `<p><strong>${args.title}</strong></p><hr/>${storageBody}<p><em>Published via D365 Debugger</em></p>`;

    let pageId = args.existingPageId;
    let finalUrl = "";

    if (pageId) {
        // Update existing page
        const pageRes = await fetch(`${baseUrl}/pages/${pageId}`, {
            headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
        });
        if (pageRes.ok) {
            const pageData = await pageRes.json();
            const response = await fetch(`${baseUrl}/pages/${pageId}`, {
                method: 'PUT',
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    id: pageId, status: 'current', title: args.title,
                    body: { representation: 'storage', value: fullBody },
                    version: { number: pageData.version.number + 1, message: "Updated via D365 Debugger" }
                })
            });
            if (!response.ok) throw new Error(`Failed to update page: ${response.status} ${await response.text()}`);
            const resultData = await response.json();
            finalUrl = `https://${sanitizedDomain}/wiki${resultData._links.webui}`;
        } else {
            throw new Error(`Failed to fetch existing page ${pageId}. It might have been deleted.`);
        }
    } else {
        // Create new page
        const createBody: any = {
            spaceId, status: 'current', title: args.title,
            body: { representation: 'storage', value: fullBody }
        };
        const effectiveParentId = args.parentPageId || parentId;
        if (effectiveParentId) createBody.parentId = effectiveParentId;

        const response = await fetch(`${baseUrl}/pages`, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(createBody)
        });
        if (!response.ok) {
            const errText = await response.text();
            if (response.status === 404 || errText.toLowerCase().includes("parent")) {
                throw new Error(`The selected parent page may no longer exist. Please choose a different page. (${response.status})`);
            }
            throw new Error(`Confluence API Error: ${response.status} ${errText}`);
        }
        const resultData = await response.json();
        pageId = resultData.id;
        finalUrl = `https://${sanitizedDomain}/wiki${resultData._links.webui}`;
    }

    if (pageId) {
        await saveFn(pageId, finalUrl);
    }

    return { success: true, url: finalUrl };
}

// =============================================
// SECURITY DOCUMENTATION
// =============================================

export const generateSecurityDocumentation = action({
    args: { tenantId: v.string() },
    handler: async (ctx, args) => {
        const [businessUnits, securityRoles, securityTeams, cachedAudit] = await Promise.all([
            ctx.runQuery(api.queries.getBusinessUnits, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSecurityRoles, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSecurityTeams, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSecurityAuditResult, { tenantId: args.tenantId }),
        ]);

        if (businessUnits.length === 0 && securityRoles.length === 0 && securityTeams.length === 0) {
            throw new Error("No security data found. Please sync security data first.");
        }

        let auditSummary = "";
        if (cachedAudit?.result) {
            try {
                const parsed = JSON.parse(cachedAudit.result);
                auditSummary = `\n\nPrevious Security Audit Summary:\n- Overall Score: ${parsed.overallScore}/100\n- Summary: ${parsed.summary}\n- Key Findings: ${(parsed.findings || []).map((f: any) => `[${f.type}] ${f.title}: ${f.description}`).join('\n  ')}`;
            } catch { /* ignore */ }
        }

        const prompt = `
You are an expert Dynamics 365 Security Consultant documenting the security posture of a D365 environment for stakeholders.
Your goal is to provide a comprehensive, well-structured security overview document.

**CRITICAL: Output ONLY valid Markdown. Do NOT start with "Here is the documentation" or "Sure". Start directly with the Metadata Table.**

Environment Security Data:

Business Units (${businessUnits.length}):
${JSON.stringify(businessUnits.map((bu: any) => ({ name: bu.name, isDisabled: bu.isDisabled, parentBusinessUnitId: bu.parentBusinessUnitId })), null, 2)}

Security Roles (${securityRoles.length}):
${JSON.stringify(securityRoles.map((r: any) => ({ name: r.name, isManaged: r.isManaged, isCustomizable: r.isCustomizable })), null, 2)}

Teams (${securityTeams.length}):
${JSON.stringify(securityTeams.map((t: any) => ({ name: t.name, teamType: t.teamType, isDefault: t.isDefault, rolesCount: t.roles.length, roleNames: t.roles.map((r: any) => r.name) })), null, 2)}
${auditSummary}

Instructions:
1.  **Metadata Table**: Start with a table containing:
    *   **Document Type**: Security Overview
    *   **Environment**: (from context)
    *   **Business Units**: ${businessUnits.length}
    *   **Security Roles**: ${securityRoles.length} (${securityRoles.filter((r: any) => !r.isManaged).length} custom)
    *   **Teams**: ${securityTeams.length}

2.  **Executive Summary**: 2-3 sentences summarizing the overall security posture.

3.  **Organization Structure**:
    *   Describe the Business Unit hierarchy using a **Mermaid.js** diagram (wrap in \`\`\`mermaid code block).
    *   Note any disabled BUs.

4.  **Security Roles Analysis**:
    *   Categorize roles into Managed (System) vs Custom.
    *   Highlight any roles that warrant attention.
    *   Use a table for role listing.

5.  **Team Configuration**:
    *   List teams grouped by type (Owner, AAD Security, AAD Office, Access).
    *   For each team, note the number of roles assigned.
    *   Flag teams with no roles or excessive roles.

6.  **Recommendations**: Based on the data, provide 3-5 actionable recommendations using callout syntax:
    *   \`> [!WARNING] Title\` for critical items
    *   \`> [!INFO] Title\` for improvements
    *   \`> [!SUCCESS] Title\` for things done well

Output Format: Markdown.
`;

        const { text } = await callClaude(prompt, { maxTokens: 4096 });
        if (!text) throw new Error("Claude returned empty content.");
        return text;
    },
});

export const publishSecurityToConfluence = action({
    args: {
        tenantId: v.string(),
        title: v.string(),
        content: v.string(),
        parentPageId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const doc = await ctx.runQuery(api.documentation.getSecurityDocumentation, { tenantId: args.tenantId });
        return publishToConfluenceHelper(
            ctx,
            {
                title: args.title,
                content: args.content,
                parentPageId: args.parentPageId,
                existingPageId: doc?.confluencePageId,
            },
            async (pageId, url) => {
                await ctx.runMutation(api.documentation.saveSecurityDocumentation, {
                    tenantId: args.tenantId,
                    content: args.content,
                    status: 'published',
                    confluencePageId: pageId,
                    confluenceUrl: url,
                });
            }
        );
    },
});

// =============================================
// APP DOCUMENTATION
// =============================================

export const generateAppDocumentation = action({
    args: { appId: v.id("model_driven_apps"), tenantId: v.string() },
    handler: async (ctx, args) => {
        const [allApps, allForms, allViews, cachedAudit] = await Promise.all([
            ctx.runQuery(api.queries.getModelDrivenApps, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSystemForms, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSystemViews, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getAppAuditResult, { appId: args.appId }),
        ]);

        const app = allApps.find((a: any) => a._id === args.appId);
        if (!app) throw new Error("App not found");

        let auditSummary = "";
        if (cachedAudit?.result) {
            try {
                const parsed = JSON.parse(cachedAudit.result);
                auditSummary = `\n\nPrevious App Audit:\n- Overall Score: ${parsed.overallScore}/100\n- Summary: ${parsed.summary}\n- Findings: ${(parsed.findings || []).map((f: any) => `[${f.type}] ${f.title}: ${f.description}`).join('\n  ')}`;
            } catch { /* ignore */ }
        }

        // Build entity breakdown for this app's context
        const entityMap: Record<string, { forms: any[]; views: any[] }> = {};
        for (const f of allForms) {
            if (!entityMap[f.entityLogicalName]) entityMap[f.entityLogicalName] = { forms: [], views: [] };
            entityMap[f.entityLogicalName].forms.push(f);
        }
        for (const v of allViews) {
            if (!entityMap[v.entityLogicalName]) entityMap[v.entityLogicalName] = { forms: [], views: [] };
            entityMap[v.entityLogicalName].views.push(v);
        }

        const prompt = `
You are an expert Dynamics 365 Functional Consultant documenting a Model-Driven App for stakeholders.
Your goal is to provide clear, comprehensive app documentation.

**CRITICAL: Output ONLY valid Markdown. Do NOT start with "Here is the documentation" or "Sure". Start directly with the Metadata Table.**

App Details:
- Name: ${app.name}
- Unique Name: ${app.uniqueName || 'N/A'}
- Version: ${app.appVersion || 'N/A'}
- Client Type: ${app.clientType === 5 ? 'Unified Interface' : app.clientType === 4 ? 'Web Client' : 'Unknown'}
- Is Managed: ${app.isManaged ? 'Yes' : 'No (Custom)'}
- Published: ${app.publishedOn || 'N/A'}
- Description: ${app.description || 'No description'}

Environment Context:
- Total Apps: ${allApps.length}
- Total Custom Forms: ${allForms.length}
- Total Custom Views: ${allViews.length}
- Entities with Customizations: ${Object.keys(entityMap).length}

Entity Customization Breakdown (top 15):
${Object.entries(entityMap)
    .sort(([, a], [, b]) => (b.forms.length + b.views.length) - (a.forms.length + a.views.length))
    .slice(0, 15)
    .map(([entity, data]) => `- ${entity}: ${data.forms.length} forms, ${data.views.length} views`)
    .join('\n')}
${auditSummary}

Instructions:
1.  **Metadata Table**: Start with a table containing:
    *   **App Name**: ${app.name}
    *   **Unique Name**: ${app.uniqueName || 'N/A'}
    *   **Type**: ${app.clientType === 5 ? 'Unified Interface' : 'Web Client'}
    *   **Managed**: ${app.isManaged ? 'Yes' : 'No'}
    *   **Version**: ${app.appVersion || 'N/A'}

2.  **App Overview**: 2-3 sentences describing the app's purpose and scope.

3.  **Architecture Diagram**: Create a high-level Mermaid.js diagram showing the app's entity relationships. Wrap in \`\`\`mermaid code block.

4.  **Entity & Form Summary**: A table listing the key entities, their forms (by type: Main, Quick Create, Quick View), and view counts.

5.  **Customization Analysis**: Discuss the customization footprint — managed vs custom components, form complexity, view proliferation.

6.  **Recommendations**: 3-5 actionable items using callout syntax:
    *   \`> [!WARNING] Title\` for issues
    *   \`> [!INFO] Title\` for improvements
    *   \`> [!SUCCESS] Title\` for well-configured areas

Output Format: Markdown.
`;

        const { text } = await callClaude(prompt, { maxTokens: 4096 });
        if (!text) throw new Error("Claude returned empty content.");
        return text;
    },
});

export const publishAppToConfluence = action({
    args: {
        appId: v.id("model_driven_apps"),
        title: v.string(),
        content: v.string(),
        parentPageId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const doc = await ctx.runQuery(api.documentation.getAppDocumentation, { appId: args.appId });
        return publishToConfluenceHelper(
            ctx,
            {
                title: args.title,
                content: args.content,
                parentPageId: args.parentPageId,
                existingPageId: doc?.confluencePageId,
            },
            async (pageId, url) => {
                await ctx.runMutation(api.documentation.saveAppDocumentation, {
                    appId: args.appId,
                    content: args.content,
                    status: 'published',
                    confluencePageId: pageId,
                    confluenceUrl: url,
                });
            }
        );
    },
});

// =============================================
// WEB RESOURCE DOCUMENTATION
// =============================================

export const generateWebResourceDocumentation = action({
    args: { webResourceId: v.id("web_resources"), tenantId: v.string(), code: v.string(), resourceName: v.string(), resourceType: v.string() },
    handler: async (ctx, args) => {
        if (!args.code) throw new Error("No code content available. Fetch the web resource content first.");

        const cachedAudit = await ctx.runQuery(api.queries.getWebResourceAuditResult, { webResourceId: args.webResourceId });

        let auditSummary = "";
        if (cachedAudit?.result) {
            try {
                const parsed = JSON.parse(cachedAudit.result);
                auditSummary = `\n\nPrevious Code Audit:\n- Overall Score: ${parsed.overallScore}/100\n- Summary: ${parsed.summary}\n- Findings: ${(parsed.findings || []).map((f: any) => `[${f.type}] ${f.title}: ${f.description}`).join('\n  ')}`;
            } catch { /* ignore */ }
        }

        const prompt = `
You are an expert Dynamics 365 Developer documenting a Web Resource for a development team.
Your goal is to explain the code's purpose, structure, and usage clearly.

**CRITICAL: Output ONLY valid Markdown. Do NOT start with "Here is the documentation" or "Sure". Start directly with the Metadata Table.**

Web Resource Details:
- Name: ${args.resourceName}
- Type: ${args.resourceType}
- Lines of Code: ${args.code.split('\n').length}

Source Code:
\`\`\`${args.resourceType.toLowerCase()}
${args.code.substring(0, 8000)}
\`\`\`
${args.code.length > 8000 ? `\n(Code truncated — full file is ${args.code.split('\n').length} lines)` : ''}
${auditSummary}

Instructions:
1.  **Metadata Table**: Start with a table containing:
    *   **Resource Name**: ${args.resourceName}
    *   **Type**: ${args.resourceType}
    *   **Lines**: ${args.code.split('\n').length}
    *   **Purpose**: (infer from code)

2.  **Overview**: 2-3 sentences explaining what this web resource does and where it's used.

3.  **Code Structure**: Describe the main functions/sections. If it's JavaScript, list the key functions with brief descriptions. Use a table format.

4.  **Dependencies & APIs**: List any D365 SDK methods, external libraries, or API calls used.

5.  **Flow Diagram**: If the code has significant logic flow, create a Mermaid.js diagram. Wrap in \`\`\`mermaid code block.

6.  **Notes & Recommendations**: Use callout syntax for important observations:
    *   \`> [!WARNING] Title\` for deprecated APIs or security concerns
    *   \`> [!INFO] Title\` for improvement suggestions
    *   \`> [!SUCCESS] Title\` for well-implemented patterns

Output Format: Markdown.
`;

        const { text } = await callClaude(prompt, { maxTokens: 4096 });
        if (!text) throw new Error("Claude returned empty content.");
        return text;
    },
});

export const publishWebResourceToConfluence = action({
    args: {
        webResourceId: v.id("web_resources"),
        title: v.string(),
        content: v.string(),
        parentPageId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const doc = await ctx.runQuery(api.documentation.getWebResourceDocumentation, { webResourceId: args.webResourceId });
        return publishToConfluenceHelper(
            ctx,
            {
                title: args.title,
                content: args.content,
                parentPageId: args.parentPageId,
                existingPageId: doc?.confluencePageId,
            },
            async (pageId, url) => {
                await ctx.runMutation(api.documentation.saveWebResourceDocumentation, {
                    webResourceId: args.webResourceId,
                    content: args.content,
                    status: 'published',
                    confluencePageId: pageId,
                    confluenceUrl: url,
                });
            }
        );
    },
});
