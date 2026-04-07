"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
const { api } = require("../_generated/api") as any;

export const analyzeSecurityOverview = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
        forceRefresh: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        // Check cache
        if (!args.forceRefresh) {
            const cached: any = await ctx.runQuery(api.queries.getSecurityAuditResult, { tenantId: args.tenantId });
            if (cached) {
                try {
                    return JSON.parse(cached.result);
                } catch (e) {
                    console.error("Failed to parse cached security audit, re-running");
                }
            }
        }

        // Gather security data from cache
        const [businessUnits, securityRoles, securityTeams] = await Promise.all([
            ctx.runQuery(api.queries.getBusinessUnits, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSecurityRoles, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSecurityTeams, { tenantId: args.tenantId }),
        ]);

        if (businessUnits.length === 0 && securityRoles.length === 0 && securityTeams.length === 0) {
            throw new Error("No security data found. Please sync security data first.");
        }

        // Build a condensed summary for Claude
        const buSummary = businessUnits.map((bu: any) => ({
            name: bu.name,
            id: bu.businessUnitId,
            parent: bu.parentBusinessUnitId,
            disabled: bu.isDisabled,
        }));

        const roleSummary = securityRoles.map((r: any) => ({
            name: r.name,
            id: r.roleId,
            businessUnit: r.businessUnitId,
            managed: r.isManaged,
            customizable: r.isCustomizable,
        }));

        const teamSummary = securityTeams.map((t: any) => ({
            name: t.name,
            id: t.teamId,
            type: t.teamType === 0 ? "Owner" : t.teamType === 1 ? "Access" : t.teamType === 2 ? "AAD Security Group" : t.teamType === 3 ? "AAD Office Group" : `Type ${t.teamType}`,
            businessUnit: t.businessUnitId,
            isDefault: t.isDefault,
            roleCount: t.roles.length,
            roles: t.roles.map((r: any) => r.name),
        }));

        const prompt = `
You are an expert Microsoft Dynamics 365 / Power Platform Security Auditor.

Analyze the following security configuration for a Dynamics 365 environment and provide a comprehensive audit.

## Business Units (${buSummary.length} total)
${JSON.stringify(buSummary, null, 2)}

## Security Roles (${roleSummary.length} total)
${JSON.stringify(roleSummary, null, 2)}

## Teams (${teamSummary.length} total)
${JSON.stringify(teamSummary, null, 2)}

Analyze this security configuration for:
1. **Business Unit Structure** - Is the hierarchy well-organized? Are there disabled BUs that should be cleaned up? Is the structure too flat or too deep?
2. **Security Role Hygiene** - Are there duplicate or very similarly named roles? Are custom roles properly managed? Are there too many roles (role sprawl)? Are roles assigned at appropriate BU levels?
3. **Team Configuration** - Are security roles assigned to teams (best practice) rather than directly to users? Are there default teams without roles? Are AAD groups being leveraged? Are there Access teams being used effectively?
4. **General Security Posture** - Overall security maturity assessment, common pitfalls, and recommendations.

Provide the output in the following JSON format ONLY (no markdown code blocks):
{
  "summary": "A one-line overall security health summary.",
  "overallScore": 85,
  "categories": {
    "businessUnits": { "score": 90, "label": "Business Units" },
    "securityRoles": { "score": 80, "label": "Security Roles" },
    "teams": { "score": 85, "label": "Teams & Access" },
    "generalPosture": { "score": 85, "label": "General Posture" }
  },
  "findings": [
    {
      "type": "error" | "warning" | "info",
      "category": "Business Units" | "Security Roles" | "Teams" | "General",
      "title": "Short title of the finding",
      "description": "Detailed explanation of the issue.",
      "suggestion": "Actionable advice to fix it."
    }
  ],
  "stats": {
    "totalBusinessUnits": ${buSummary.length},
    "disabledBusinessUnits": ${buSummary.filter((b: any) => b.disabled).length},
    "totalRoles": ${roleSummary.length},
    "customRoles": ${roleSummary.filter((r: any) => !r.managed).length},
    "managedRoles": ${roleSummary.filter((r: any) => r.managed).length},
    "totalTeams": ${teamSummary.length},
    "ownerTeams": ${teamSummary.filter((t: any) => t.type === "Owner").length},
    "accessTeams": ${teamSummary.filter((t: any) => t.type === "Access").length},
    "aadTeams": ${teamSummary.filter((t: any) => t.type.startsWith("AAD")).length},
    "teamsWithNoRoles": ${teamSummary.filter((t: any) => t.roleCount === 0).length}
  }
}

The scores should be 0-100 where:
- 90-100: Excellent
- 70-89: Good, minor improvements needed
- 50-69: Fair, significant improvements needed
- 0-49: Poor, critical issues

Be thorough but practical. Focus on actionable findings.
`;

        // Call Claude
        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey) {
            throw new Error("CLAUDE_API_KEY is not defined in environment variables.");
        }

        // List available models
        const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const modelsResponse = await fetch(modelsUrl);

        if (!modelsResponse.ok) {
            const errorText = await modelsResponse.text();
            throw new Error(`Failed to list models: ${modelsResponse.status} ${errorText}`);
        }

        const modelsData = await modelsResponse.json();
        const availableModels = modelsData.models || [];

        const contentModels = availableModels.filter((m: any) =>
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
        );

        if (contentModels.length === 0) {
            throw new Error("No models found that support generateContent.");
        }

        const sortedModels = contentModels.sort((a: any, b: any) => {
            const getScore = (name: string) => {
                if (name.includes("claude-1.5-flash")) return 10;
                if (name.includes("claude-1.5-pro")) return 8;
                if (name.includes("claude-pro")) return 5;
                if (name.includes("flash")) return 3;
                return 1;
            };
            return getScore(b.name) - getScore(a.name);
        });

        let claudeResponse = null;
        let lastError = null;
        let successfulModel = "";

        for (const model of sortedModels) {
            const modelName = model.name.replace("models/", "");
            const claudeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

            console.log(`[analyzeSecurityOverview] Attempting with model: ${modelName}`);

            try {
                const response = await fetch(claudeUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                });

                if (response.ok) {
                    claudeResponse = response;
                    successfulModel = modelName;
                    break;
                } else {
                    const errorText = await response.text();
                    console.warn(`[analyzeSecurityOverview] Model ${modelName} failed: ${response.status} ${errorText}`);
                    lastError = new Error(`Model ${modelName} error: ${response.status} ${errorText}`);
                }
            } catch (e) {
                console.warn(`[analyzeSecurityOverview] Network error with model ${modelName}:`, e);
                lastError = e instanceof Error ? e : new Error(String(e));
            }
        }

        if (!claudeResponse || !claudeResponse.ok) {
            throw lastError || new Error("All Claude models failed to generate content.");
        }

        const claudeData = await claudeResponse.json();
        const generatedText = claudeData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            throw new Error("Claude returned no content.");
        }

        try {
            const cleanedText = generatedText.replace(/```json/g, "").replace(/```/g, "").trim();
            const result = JSON.parse(cleanedText);

            // Cache the result
            await ctx.runMutation(api.mutations.saveSecurityAuditResult, {
                tenantId: args.tenantId,
                result: cleanedText,
                model: successfulModel,
            });

            return result;
        } catch (e) {
            console.error("Failed to parse Claude security audit response:", generatedText);
            throw new Error("Failed to parse security analysis results from Claude.");
        }
    },
});
