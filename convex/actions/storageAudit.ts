"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
const { api } = require("../_generated/api") as any;

export const analyzeStorageOverview = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
        forceRefresh: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        // Check cache
        if (!args.forceRefresh) {
            const cached: any = await ctx.runQuery(api.queries.getStorageAuditResult, { tenantId: args.tenantId });
            if (cached) {
                try {
                    return JSON.parse(cached.result);
                } catch (e) {
                    console.error("Failed to parse cached storage audit, re-running");
                }
            }
        }

        // Gather storage data
        const environmentStorage = await ctx.runQuery(api.queries.getEnvironmentStorage, { tenantId: args.tenantId });

        if (environmentStorage.length === 0) {
            throw new Error("No storage data found. Please sync storage data first.");
        }

        // Build summary for Claude
        const envSummary = environmentStorage.map((env: any) => {
            const tableBreakdown = env.tableBreakdown ? JSON.parse(env.tableBreakdown) : [];
            return {
                name: env.envName,
                id: env.envId,
                type: env.envType,
                state: env.envState,
                database: {
                    capacityMB: env.dbCapacityMB,
                    usedMB: env.dbUsedMB,
                    usagePercent: env.dbCapacityMB > 0 ? Math.round((env.dbUsedMB || 0) / env.dbCapacityMB * 100) : 0,
                },
                file: {
                    capacityMB: env.fileCapacityMB,
                    usedMB: env.fileUsedMB,
                    usagePercent: env.fileCapacityMB > 0 ? Math.round((env.fileUsedMB || 0) / env.fileCapacityMB * 100) : 0,
                },
                log: {
                    capacityMB: env.logCapacityMB,
                    usedMB: env.logUsedMB,
                    usagePercent: env.logCapacityMB > 0 ? Math.round((env.logUsedMB || 0) / env.logCapacityMB * 100) : 0,
                },
                topTables: tableBreakdown.slice(0, 20).map((t: any) => ({
                    name: t.displayName || t.logicalName,
                    logicalName: t.logicalName,
                    recordCount: t.recordCount,
                    isCustom: t.isCustom,
                    isManaged: t.isManaged,
                })),
            };
        });

        const totalDbCapacity = envSummary.reduce((sum: number, e: any) => sum + e.database.capacityMB, 0);
        const totalDbUsed = envSummary.reduce((sum: number, e: any) => sum + (e.database.usedMB || 0), 0);
        const totalFileCapacity = envSummary.reduce((sum: number, e: any) => sum + e.file.capacityMB, 0);
        const totalFileUsed = envSummary.reduce((sum: number, e: any) => sum + (e.file.usedMB || 0), 0);
        const totalLogCapacity = envSummary.reduce((sum: number, e: any) => sum + e.log.capacityMB, 0);
        const totalLogUsed = envSummary.reduce((sum: number, e: any) => sum + (e.log.usedMB || 0), 0);

        const prompt = `
You are an expert Microsoft Dynamics 365 / Power Platform Storage Auditor.

Analyze the following environment storage data and provide actionable recommendations for optimizing capacity usage.

## Environment Storage Overview (${envSummary.length} environments)
- Total Database: ${totalDbUsed}MB used of ${totalDbCapacity}MB capacity (${totalDbCapacity > 0 ? Math.round(totalDbUsed / totalDbCapacity * 100) : 0}%)
- Total File: ${totalFileUsed}MB used of ${totalFileCapacity}MB capacity
- Total Log: ${totalLogUsed}MB used of ${totalLogCapacity}MB capacity

## Per-Environment Details
${JSON.stringify(envSummary, null, 2)}

Analyze this storage data for:
1. **Capacity Utilization** - Are any environments approaching capacity limits? Are there environments with wasted capacity?
2. **Database Optimization** - Large tables that could benefit from archival or cleanup. Audit log tables that should be pruned. Tables with excessive record counts.
3. **File Storage** - Notes/attachments tables consuming excessive file storage. Opportunities to move files to external storage.
4. **Log Optimization** - Log capacity usage patterns and cleanup recommendations.
5. **General Recommendations** - Environment consolidation opportunities, capacity reallocation suggestions, bulk delete candidates.

Provide the output in the following JSON format ONLY (no markdown code blocks):
{
  "summary": "A one-line overall storage health summary.",
  "overallScore": 75,
  "categories": {
    "capacityUtilization": { "score": 80, "label": "Capacity Utilization" },
    "databaseOptimization": { "score": 70, "label": "Database Optimization" },
    "fileStorage": { "score": 75, "label": "File Storage" },
    "logOptimization": { "score": 80, "label": "Log Optimization" }
  },
  "findings": [
    {
      "type": "error" | "warning" | "info",
      "category": "Capacity" | "Database" | "File Storage" | "Log" | "General",
      "title": "Short title of the finding",
      "description": "Detailed explanation of the issue.",
      "suggestion": "Actionable advice to fix it.",
      "estimatedSavingsMB": 0
    }
  ],
  "stats": {
    "totalEnvironments": ${envSummary.length},
    "totalDbCapacityMB": ${totalDbCapacity},
    "totalDbUsedMB": ${totalDbUsed},
    "totalFileCapacityMB": ${totalFileCapacity},
    "totalFileUsedMB": ${totalFileUsed},
    "totalLogCapacityMB": ${totalLogCapacity},
    "totalLogUsedMB": ${totalLogUsed},
    "highUtilizationEnvs": 0,
    "tablesAnalyzed": 0
  }
}

The scores should be 0-100 where:
- 90-100: Excellent capacity management
- 70-89: Good, minor optimizations possible
- 50-69: Fair, significant cleanup needed
- 0-49: Critical, immediate action required

Be thorough but practical. Focus on actionable findings with estimated storage savings where possible.
`;

        // Call Claude
        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey) {
            throw new Error("CLAUDE_API_KEY is not defined in environment variables.");
        }

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

            console.log(`[analyzeStorageOverview] Attempting with model: ${modelName}`);

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
                    console.warn(`[analyzeStorageOverview] Model ${modelName} failed: ${response.status} ${errorText}`);
                    lastError = new Error(`Model ${modelName} error: ${response.status} ${errorText}`);
                }
            } catch (e) {
                console.warn(`[analyzeStorageOverview] Network error with model ${modelName}:`, e);
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
            await ctx.runMutation(api.mutations.saveStorageAuditResult, {
                tenantId: args.tenantId,
                result: cleanedText,
                model: successfulModel,
            });

            return result;
        } catch (e) {
            console.error("Failed to parse Claude storage audit response:", generatedText);
            throw new Error("Failed to parse storage analysis results from Claude.");
        }
    },
});
