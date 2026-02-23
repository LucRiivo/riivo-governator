"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { decrypt } from "./lib/crypto";
import { getD365AccessToken } from "./lib/tokenHelper";
// Use require to avoid circular type dependency
const { api } = require("./_generated/api") as any;

export const analyzeFlow = action({
    args: { tenantId: v.string(), flowId: v.string(), orgId: v.optional(v.string()), forceRefresh: v.optional(v.boolean()) },
    handler: async (ctx, args): Promise<any> => {
        // 0. Check Cache
        const existingFlow = await ctx.runQuery(api.queries.getFlowByExternalId, { workflowId: args.flowId });

        if (existingFlow) {
            const cachedResult: any = await ctx.runQuery(api.queries.getAuditResult, { flowId: existingFlow._id });
            if (cachedResult && !args.forceRefresh) {
                console.log(`[analyzeFlow] Returning cached result for ${args.flowId}`);
                try {
                    return JSON.parse(cachedResult.result);
                } catch (e) {
                    console.error("Failed to parse cached result, re-running analysis");
                }
            }
        }

        // 1. Fetch Tenant Details
        const tenants: any[] = await ctx.runQuery(api.queries.getTenants, { orgId: args.orgId });
        const tenant = tenants.find((t: any) => t.tenantId === args.tenantId);

        if (!tenant) throw new Error("Tenant not found");

        let clientData = existingFlow?.clientData ? JSON.parse(existingFlow.clientData) : null;

        // Force re-fetch if requested
        if (args.forceRefresh) {
            clientData = null;
        }
        let flowName = existingFlow?.name || "Unknown Flow";
        let description = "No description provided.";

        if (!clientData) {
            const sanitizedUrl = tenant.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const token = await getD365AccessToken(sanitizedUrl, tenant.clientId, decrypt(tenant.clientSecret), tenant.tenantDirectoryId);

            // 2. Fetch Flow Definition (Client Data)
            const url = `https://${sanitizedUrl}/api/data/v9.2/workflows(${args.flowId})?$select=clientdata,name,description`;

            console.log(`[analyzeFlow] Fetching definition from: ${url}`);

            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch flow definition: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            flowName = data.name;
            description = data.description || "No description provided.";
            clientData = data.clientdata ? JSON.parse(data.clientdata) : {};

            // We should optimally cache this definition now, but since existingFlow might be null or incomplete, requires handling.
            // We can defer upsert to a separate flow sync step or do it here if we want to be robust. 
            // For now, proceed to analysis.
            // Save the fresh definition
            if (existingFlow) {
                await ctx.runMutation(api.mutations.updateFlowClientData, {
                    flowId: existingFlow._id,
                    clientData: JSON.stringify(clientData)
                });
            }
        }


        // 3. Construct Gemini Prompt
        // We trim the clientData to avoid hitting token limits if it's huge, 
        // though Gemini 1.5/2.0 has large context. 
        // For now, let's send the structure.
        const prompt = `
You are an expert Power Automate Logic Auditor.
Analyze the following Power Automate flow definition (JSON) for logic errors, performance bottlenecks, and best practice violations.

Flow Name: ${flowName}
Description: ${description}

Flow Definition (snippet):
${JSON.stringify(clientData, null, 2)}

Provide the output in the following JSON format ONLY (no markdown code blocks):
{
  "summary": "A one-line summary of the audit result.",
  "findings": [
    {
      "type": "error" | "warning" | "info",
      "category": "Logic" | "Performance" | "Security" | "Reliability",
      "title": "Short title of the finding",
      "description": "Detailed explanation of the issue.",
      "suggestion": "Actionable advice to fix it."
    }
  ]
}
If there are no issues, return an empty findings array and a success summary.
`;

        // 4. Call Gemini API
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not defined in environment variables.");
        }

        // 4a. Dynamically find a valid model
        console.log(`[analyzeFlow] Listing available models...`);
        const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const modelsResponse = await fetch(modelsUrl);

        if (!modelsResponse.ok) {
            const errorText = await modelsResponse.text();
            throw new Error(`Failed to list models: ${modelsResponse.status} ${errorText}`);
        }

        const modelsData = await modelsResponse.json();
        const availableModels = modelsData.models || [];

        // Filter for models that support generateContent
        const contentModels = availableModels.filter((m: any) =>
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
        );

        if (contentModels.length === 0) {
            throw new Error("No models found that support generateContent.");
        }

        // Prioritize models: Flash > Pro > Preview > Others
        // We sort them so we can iterate and try each one until success
        const sortedModels = contentModels.sort((a: any, b: any) => {
            const getScore = (name: string) => {
                if (name.includes("gemini-1.5-flash")) return 10;
                if (name.includes("gemini-1.5-pro")) return 8;
                if (name.includes("gemini-pro")) return 5;
                if (name.includes("flash")) return 3;
                return 1;
            };
            return getScore(b.name) - getScore(a.name);
        });

        console.log(`[analyzeFlow] Available models (sorted): ${sortedModels.map((m: any) => m.name).join(", ")}`);

        let geminiResponse = null;
        let lastError = null;
        let successfulModel = "";

        // Try models in order
        for (const model of sortedModels) {
            const modelName = model.name.replace("models/", "");
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

            console.log(`[analyzeFlow] Attempting cleaning with model: ${modelName}`);

            try {
                const response = await fetch(geminiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: prompt }]
                        }]
                    })
                });

                if (response.ok) {
                    // apiResponse = response; 
                    console.log(`[analyzeFlow] Success with model: ${modelName}`);
                    geminiResponse = response;
                    successfulModel = modelName;
                    break; // Exit loop on success
                } else {
                    const errorText = await response.text();
                    console.warn(`[analyzeFlow] Model ${modelName} failed: ${response.status} ${errorText}`);
                    lastError = new Error(`Model ${modelName} error: ${response.status} ${errorText}`);

                    // Specific handling for 429 (Quota) - just continue to next model
                    // Specific handling for 404 (Not Found) - just continue to next model
                }
            } catch (e) {
                console.warn(`[analyzeFlow] Network error with model ${modelName}:`, e);
                lastError = e instanceof Error ? e : new Error(String(e));
            }
        }

        if (!geminiResponse || !geminiResponse.ok) {
            throw lastError || new Error("All Gemini models failed to generate content.");
        }

        const geminiData = await geminiResponse.json();
        const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            throw new Error("Gemini returned no content.");
        }

        // 5. Parse and Return Result
        try {
            // Clean up any markdown code blocks if the model ignores the "no markdown" instruction
            const cleanedText = generatedText.replace(/```json/g, "").replace(/```/g, "").trim();
            const result = JSON.parse(cleanedText);

            // Cache the result if we have a flow entry
            if (existingFlow) {
                await ctx.runMutation(api.mutations.saveAuditResult, {
                    flowId: existingFlow._id,
                    result: cleanedText,
                    model: successfulModel
                });
            }

            return result;
        } catch (e) {
            console.error("Failed to parse Gemini response:", generatedText);
            throw new Error("Failed to parse analysis results from Gemini.");
        }
    },
});

// Phase 6: Environment Health Assessment
export const assessEnvironmentHealth = action({
    args: { tenantId: v.string(), orgId: v.optional(v.string()) },
    handler: async (ctx, args): Promise<any> => {
        const summary = await ctx.runQuery(api.queries.getEnvironmentHealthSummary, { tenantId: args.tenantId });
        if (!summary) throw new Error("No data available for this tenant.");

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

        const modelsToTry = [
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
        ];

        const prompt = `You are a Power Platform / Dynamics 365 environment health auditor. Analyze this environment data and produce a health assessment.

ENVIRONMENT DATA:
${JSON.stringify(summary, null, 2)}

Produce a JSON response with this exact structure (no markdown, just raw JSON):
{
  "overallScore": <number 0-100>,
  "categoryScores": {
    "security": <number 0-100>,
    "codeQuality": <number 0-100>,
    "appHealth": <number 0-100>,
    "performance": <number 0-100>,
    "storage": <number 0-100>
  },
  "issuesSummary": { "critical": <count>, "warning": <count>, "info": <count> },
  "advisories": [
    {
      "category": "security"|"codeQuality"|"appHealth"|"performance"|"storage",
      "severity": "critical"|"warning"|"info",
      "title": "<short title>",
      "description": "<what's wrong and why it matters>",
      "remediation": "<step-by-step fix>"
    }
  ]
}

SCORING GUIDELINES:
- Security (25% weight): Evaluate BU structure (disabled BUs are a concern), custom vs managed roles ratio, team usage (AAD teams preferred over owner teams), role sprawl
- Code Quality (20% weight): Evaluate JS web resources count, managed vs unmanaged ratio (unmanaged = risk), total web resources count
- App Health (20% weight): Evaluate app count, form complexity (forms per app), managed vs unmanaged forms, view density
- Performance (20% weight): If App Insights is NOT connected, give a lower score (50) as there's no visibility. If connected, base on available data.
- Storage (15% weight): If PP Admin is NOT connected, give a lower score (50). If connected, evaluate capacity usage.

Generate 3-8 actionable advisories ranked by severity. Each remediation should be specific and actionable with concrete steps.
If certain modules have no data (count is 0), note that data needs to be synced first.`;

        let geminiResponse = null;
        let successfulModel = "unknown";
        let lastError: Error | null = null;

        for (const modelName of modelsToTry) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
                    }),
                });
                if (response.ok) {
                    geminiResponse = response;
                    successfulModel = modelName;
                    break;
                } else {
                    const errorText = await response.text();
                    lastError = new Error(`Model ${modelName} error: ${response.status} ${errorText}`);
                }
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
            }
        }

        if (!geminiResponse || !geminiResponse.ok) {
            throw lastError || new Error("All Gemini models failed.");
        }

        const geminiData = await geminiResponse.json();
        const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!generatedText) throw new Error("Gemini returned no content.");

        const cleanedText = generatedText.replace(/```json/g, "").replace(/```/g, "").trim();
        const result = JSON.parse(cleanedText);

        // Save health snapshot
        await ctx.runMutation(api.mutations.saveHealthSnapshot, {
            tenantId: args.tenantId,
            overallScore: result.overallScore,
            categoryScores: JSON.stringify(result.categoryScores),
            issuesSummary: JSON.stringify(result.issuesSummary),
        });

        // Save advisories
        if (result.advisories && result.advisories.length > 0) {
            await ctx.runMutation(api.mutations.saveAdvisories, {
                tenantId: args.tenantId,
                advisories: result.advisories,
            });
        }

        return result;
    },
});

