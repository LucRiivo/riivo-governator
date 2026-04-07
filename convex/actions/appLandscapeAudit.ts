"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
const { api } = require("../_generated/api") as any;

const FORM_TYPE_LABELS: Record<number, string> = { 2: "Main", 5: "Mobile", 6: "Quick View", 7: "Quick Create", 11: "Main Interactive" };
const CLIENT_TYPE_LABELS: Record<number, string> = { 4: "Web", 5: "Unified Interface" };

async function callClaude(prompt: string): Promise<{ text: string; model: string }> {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) throw new Error("CLAUDE_API_KEY is not defined.");

    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const modelsResponse = await fetch(modelsUrl);
    if (!modelsResponse.ok) throw new Error(`Failed to list models: ${modelsResponse.status}`);

    const modelsData = await modelsResponse.json();
    const contentModels = (modelsData.models || []).filter((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent")
    ).sort((a: any, b: any) => {
        const s = (n: string) => n.includes("claude-1.5-flash") ? 10 : n.includes("claude-1.5-pro") ? 8 : n.includes("flash") ? 3 : 1;
        return s(b.name) - s(a.name);
    });

    if (contentModels.length === 0) throw new Error("No Claude models available.");

    let claudeResponse = null;
    let lastError = null;
    let successfulModel = "";

    for (const model of contentModels) {
        const modelName = model.name.replace("models/", "");
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                }
            );
            if (response.ok) { claudeResponse = response; successfulModel = modelName; break; }
            else { lastError = new Error(`${modelName}: ${response.status}`); }
        } catch (e) { lastError = e instanceof Error ? e : new Error(String(e)); }
    }

    if (!claudeResponse) throw lastError || new Error("All models failed.");

    const claudeData = await claudeResponse.json();
    const text = claudeData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Claude returned no content.");

    return { text, model: successfulModel };
}

export const analyzeAppLandscape = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
        forceRefresh: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        if (!args.forceRefresh) {
            const cached: any = await ctx.runQuery(api.queries.getAppLandscapeAuditResult, { tenantId: args.tenantId });
            if (cached) {
                try { return JSON.parse(cached.result); }
                catch (e) { console.error("Failed to parse cached app landscape audit, re-running"); }
            }
        }

        const [apps, forms, views] = await Promise.all([
            ctx.runQuery(api.queries.getModelDrivenApps, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSystemForms, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSystemViews, { tenantId: args.tenantId }),
        ]);

        if (apps.length === 0 && forms.length === 0 && views.length === 0) {
            throw new Error("No app landscape data found. Please sync apps, forms, and views first.");
        }

        // Build entity summary: which entities have forms/views, how many of each
        const entityMap: Record<string, { forms: number; mainForms: number; quickViews: number; quickCreates: number; views: number; defaultViews: number }> = {};

        for (const form of forms) {
            if (!entityMap[form.entityLogicalName]) {
                entityMap[form.entityLogicalName] = { forms: 0, mainForms: 0, quickViews: 0, quickCreates: 0, views: 0, defaultViews: 0 };
            }
            entityMap[form.entityLogicalName].forms++;
            if (form.formType === 2 || form.formType === 11) entityMap[form.entityLogicalName].mainForms++;
            if (form.formType === 6) entityMap[form.entityLogicalName].quickViews++;
            if (form.formType === 7) entityMap[form.entityLogicalName].quickCreates++;
        }

        for (const view of views) {
            if (!entityMap[view.entityLogicalName]) {
                entityMap[view.entityLogicalName] = { forms: 0, mainForms: 0, quickViews: 0, quickCreates: 0, views: 0, defaultViews: 0 };
            }
            entityMap[view.entityLogicalName].views++;
            if (view.isDefault) entityMap[view.entityLogicalName].defaultViews++;
        }

        const appSummary = apps.map((a: any) => ({
            name: a.name,
            uniqueName: a.uniqueName,
            clientType: CLIENT_TYPE_LABELS[a.clientType] || `Type ${a.clientType}`,
            managed: a.isManaged,
            version: a.appVersion,
        }));

        const entitySummary = Object.entries(entityMap).map(([entity, stats]) => ({
            entity,
            ...stats,
        })).sort((a, b) => (b.forms + b.views) - (a.forms + a.views));

        const prompt = `
You are an expert Microsoft Dynamics 365 / Power Platform App Landscape Auditor.

Analyze the following model-driven app landscape for a Dynamics 365 environment.

## Model-Driven Apps (${appSummary.length} total)
${JSON.stringify(appSummary, null, 2)}

## Entity Customization Summary (${entitySummary.length} entities with custom forms/views)
Top entities by customization:
${JSON.stringify(entitySummary.slice(0, 30), null, 2)}

## Aggregate Stats
- Total custom forms: ${forms.length} (Main: ${forms.filter((f: any) => f.formType === 2 || f.formType === 11).length}, Quick View: ${forms.filter((f: any) => f.formType === 6).length}, Quick Create: ${forms.filter((f: any) => f.formType === 7).length})
- Total custom views: ${views.length}
- Entities with >3 main forms: ${entitySummary.filter(e => e.mainForms > 3).map(e => e.entity).join(', ') || 'None'}
- Entities with >10 views: ${entitySummary.filter(e => e.views > 10).map(e => e.entity).join(', ') || 'None'}

Analyze for:
1. **App Sprawl** - Too many apps? Overlapping apps that serve similar purposes? Apps that could be consolidated?
2. **Form Complexity** - Entities with too many main forms (causes confusion), entities with missing Quick Create forms, form sprawl per entity
3. **View Sprawl** - Entities with excessive custom views, entities missing default views, duplicate/similar view names
4. **Architecture** - Are Unified Interface apps used (best practice)? Any legacy web client apps? Overall app organization quality
5. **Entity Coverage** - Are key entities properly covered with forms and views? Any orphaned customizations?

Provide the output in the following JSON format ONLY (no markdown code blocks):
{
  "summary": "A one-line app landscape health summary.",
  "overallScore": 80,
  "categories": {
    "appOrganization": { "score": 85, "label": "App Organization" },
    "formHealth": { "score": 75, "label": "Form Health" },
    "viewHealth": { "score": 80, "label": "View Health" },
    "architecture": { "score": 85, "label": "Architecture" }
  },
  "findings": [
    {
      "type": "error" | "warning" | "info",
      "category": "App Organization" | "Forms" | "Views" | "Architecture",
      "title": "Short title",
      "description": "Detailed explanation.",
      "suggestion": "Actionable fix."
    }
  ],
  "stats": {
    "totalApps": ${appSummary.length},
    "totalForms": ${forms.length},
    "totalViews": ${views.length},
    "entitiesCustomized": ${entitySummary.length},
    "entitiesWithExcessForms": ${entitySummary.filter(e => e.mainForms > 3).length},
    "entitiesWithExcessViews": ${entitySummary.filter(e => e.views > 10).length}
  }
}

Scores 0-100: 90-100 Excellent, 70-89 Good, 50-69 Fair, 0-49 Poor.
`;

        const { text: rawText, model: successfulModel } = await callClaude(prompt);

        const cleanedText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const result = JSON.parse(cleanedText);

        await ctx.runMutation(api.mutations.saveAppLandscapeAuditResult, {
            tenantId: args.tenantId,
            result: cleanedText,
            model: successfulModel,
        });

        return result;
    },
});

export const analyzeApp = action({
    args: {
        tenantId: v.string(),
        appId: v.id("model_driven_apps"),
        forceRefresh: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        if (!args.forceRefresh) {
            const cached: any = await ctx.runQuery(api.queries.getAppAuditResult, { appId: args.appId });
            if (cached) {
                try { return JSON.parse(cached.result); }
                catch (e) { console.error("Failed to parse cached app audit, re-running"); }
            }
        }

        const app: any = await ctx.runQuery(api.queries.getModelDrivenApps, { tenantId: args.tenantId });
        const selectedApp = app.find((a: any) => a._id === args.appId);
        if (!selectedApp) throw new Error("App not found in cached data.");

        const [forms, views] = await Promise.all([
            ctx.runQuery(api.queries.getSystemForms, { tenantId: args.tenantId }),
            ctx.runQuery(api.queries.getSystemViews, { tenantId: args.tenantId }),
        ]);

        if (forms.length === 0 && views.length === 0) {
            throw new Error("No forms or views data found. Please sync first.");
        }

        // Build per-entity breakdown
        const entityMap: Record<string, { forms: any[]; views: any[] }> = {};
        for (const form of forms) {
            if (!entityMap[form.entityLogicalName]) entityMap[form.entityLogicalName] = { forms: [], views: [] };
            entityMap[form.entityLogicalName].forms.push({
                name: form.name,
                type: FORM_TYPE_LABELS[form.formType] || `Type ${form.formType}`,
                formType: form.formType,
            });
        }
        for (const view of views) {
            if (!entityMap[view.entityLogicalName]) entityMap[view.entityLogicalName] = { forms: [], views: [] };
            entityMap[view.entityLogicalName].views.push({
                name: view.name,
                queryType: view.queryType,
                isDefault: view.isDefault,
            });
        }

        const entityDetails = Object.entries(entityMap)
            .map(([entity, data]) => ({
                entity,
                formCount: data.forms.length,
                viewCount: data.views.length,
                mainForms: data.forms.filter(f => f.formType === 2 || f.formType === 11).length,
                quickViews: data.forms.filter(f => f.formType === 6).length,
                quickCreates: data.forms.filter(f => f.formType === 7).length,
                forms: data.forms.map(f => `${f.name} (${f.type})`),
                views: data.views.slice(0, 10).map((v: any) => v.name),
            }))
            .sort((a, b) => (b.formCount + b.viewCount) - (a.formCount + a.viewCount));

        const clientType = CLIENT_TYPE_LABELS[selectedApp.clientType] || `Type ${selectedApp.clientType}`;

        const prompt = `
You are an expert Microsoft Dynamics 365 / Power Platform Model-Driven App Auditor.

Analyze the following model-driven app and its related customizations in detail.

## App Details
- **Name**: ${selectedApp.name}
- **Unique Name**: ${selectedApp.uniqueName || 'N/A'}
- **Client Type**: ${clientType}
- **Version**: ${selectedApp.appVersion || 'N/A'}
- **Managed**: ${selectedApp.isManaged ? 'Yes' : 'No'}
- **Description**: ${selectedApp.description || 'None'}
- **Published**: ${selectedApp.publishedOn || 'N/A'}

## Environment Customizations (${entityDetails.length} customized entities, ${forms.length} total custom forms, ${views.length} total custom views)

Top customized entities:
${JSON.stringify(entityDetails.slice(0, 25), null, 2)}

## Key Metrics
- Entities with >3 main forms: ${entityDetails.filter(e => e.mainForms > 3).map(e => e.entity).join(', ') || 'None'}
- Entities with >10 views: ${entityDetails.filter(e => e.viewCount > 10).map(e => e.entity).join(', ') || 'None'}
- Entities missing Quick Create forms: ${entityDetails.filter(e => e.quickCreates === 0 && e.mainForms > 0).map(e => e.entity).join(', ') || 'None'}

Analyze this specific app for:
1. **App Configuration** - Is the client type correct (Unified Interface is best practice)? Is the app well-described? Is versioning properly used?
2. **Form Health** - Per-entity: too many main forms causing user confusion? Missing Quick Create forms? Duplicate or similarly-named forms? Form type distribution
3. **View Health** - Per-entity: excessive custom views? Missing default views? Poorly named or duplicate views?
4. **Complexity** - Overall customization volume, potential maintenance burden, entities that are over-customized
5. **Best Practices** - Naming conventions, managed vs unmanaged balance, Quick View form usage for related entity data

Provide the output in the following JSON format ONLY (no markdown code blocks):
{
  "summary": "A one-line health summary for this specific app.",
  "overallScore": 80,
  "categories": {
    "appConfig": { "score": 85, "label": "App Config" },
    "formHealth": { "score": 75, "label": "Form Health" },
    "viewHealth": { "score": 80, "label": "View Health" },
    "complexity": { "score": 70, "label": "Complexity" }
  },
  "findings": [
    {
      "type": "error" | "warning" | "info",
      "category": "App Config" | "Forms" | "Views" | "Complexity" | "Best Practices",
      "title": "Short title",
      "description": "Detailed explanation.",
      "suggestion": "Actionable fix."
    }
  ],
  "stats": {
    "entitiesCustomized": ${entityDetails.length},
    "totalForms": ${forms.length},
    "totalViews": ${views.length},
    "entitiesWithExcessForms": ${entityDetails.filter(e => e.mainForms > 3).length},
    "entitiesWithExcessViews": ${entityDetails.filter(e => e.viewCount > 10).length}
  }
}

Scores 0-100: 90-100 Excellent, 70-89 Good, 50-69 Fair, 0-49 Poor.
`;

        const { text: rawText, model: successfulModel } = await callClaude(prompt);

        const cleanedText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const result = JSON.parse(cleanedText);

        await ctx.runMutation(api.mutations.saveAppAuditResult, {
            appId: args.appId,
            tenantId: args.tenantId,
            result: cleanedText,
            model: successfulModel,
        });

        return result;
    },
});
