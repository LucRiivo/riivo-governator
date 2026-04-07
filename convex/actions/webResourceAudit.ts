"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
const { api } = require("../_generated/api") as any;

export const analyzeWebResource = action({
    args: {
        webResourceConvexId: v.id("web_resources"),
        tenantId: v.string(),
        code: v.string(),
        resourceName: v.string(),
        resourceType: v.string(), // "JScript", "HTML", "CSS", etc.
        forceRefresh: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        // Check cache
        if (!args.forceRefresh) {
            const cached: any = await ctx.runQuery(api.queries.getWebResourceAuditResult, {
                webResourceId: args.webResourceConvexId
            });
            if (cached) {
                try {
                    return JSON.parse(cached.result);
                } catch (e) {
                    console.error("Failed to parse cached web resource audit, re-running");
                }
            }
        }

        if (!args.code || args.code.trim().length === 0) {
            throw new Error("No code content to analyze.");
        }

        // Truncate very large files to stay within token limits
        const maxCodeLength = 50000;
        const codeSnippet = args.code.length > maxCodeLength
            ? args.code.substring(0, maxCodeLength) + "\n\n// ... [truncated - file too large for full analysis] ..."
            : args.code;

        const prompt = `
You are an expert Microsoft Dynamics 365 / Power Platform Web Resource Code Auditor.

Analyze the following ${args.resourceType} web resource from a Dynamics 365 environment.

**Resource Name:** ${args.resourceName}
**Resource Type:** ${args.resourceType}

**Code:**
\`\`\`${args.resourceType === "JScript" ? "javascript" : args.resourceType.toLowerCase()}
${codeSnippet}
\`\`\`

Analyze this code for the following categories:

${args.resourceType === "JScript" ? `
1. **Deprecated API Usage** - Look for deprecated Xrm SDK methods: Xrm.Page (should use formContext), Xrm.Utility.alertDialog (should use Xrm.Navigation), GlobalContext usage patterns, deprecated execution context methods
2. **Performance Issues** - Synchronous XMLHttpRequest, excessive DOM manipulation, missing async/await patterns, blocking operations, unnecessary loops, large closures
3. **Security Vulnerabilities** - eval() usage, innerHTML without sanitization, hardcoded credentials/tokens, XSS risk patterns, unsafe postMessage handling
4. **Best Practice Violations** - Hardcoded GUIDs or environment URLs, jQuery usage (should use native APIs), global namespace pollution, missing error handling/try-catch, no null checks on form context attributes, direct window.open instead of Xrm.Navigation
5. **Maintainability** - No JSDoc comments, deeply nested callbacks (callback hell), magic numbers/strings, overly complex functions (cyclomatic complexity), dead code
6. **Supportability** - Unsupported customizations that may break during updates, use of internal/undocumented APIs, direct DOM access to form elements (fragile selectors)
` : args.resourceType === "HTML" ? `
1. **Security Issues** - Inline scripts without CSP consideration, external resource loading, form action to external URLs, missing input sanitization
2. **Accessibility** - Missing ARIA attributes, missing alt text, improper heading hierarchy, missing lang attribute
3. **Best Practices** - Inline styles (should use CSS), deprecated HTML elements, missing doctype, hardcoded URLs
4. **Performance** - Large inline scripts, unoptimized images, blocking resources
` : `
1. **Best Practices** - Vendor prefixes without standard properties, !important overuse, overly specific selectors
2. **Performance** - Large selectors, unused rules patterns, expensive properties (box-shadow in animations)
3. **Maintainability** - Magic numbers, no CSS variables usage, deeply nested selectors
`}

Provide the output in the following JSON format ONLY (no markdown code blocks):
{
  "summary": "A one-line summary of the code quality.",
  "overallScore": 75,
  "lineCount": ${codeSnippet.split('\n').length},
  "findings": [
    {
      "type": "error" | "warning" | "info",
      "category": "Deprecated API" | "Performance" | "Security" | "Best Practice" | "Maintainability" | "Supportability" | "Accessibility",
      "title": "Short title",
      "description": "Detailed explanation with specific line references where possible.",
      "suggestion": "Actionable fix with code example if applicable.",
      "lineReference": "Line ~42" 
    }
  ],
  "stats": {
    "deprecatedAPIs": 0,
    "securityIssues": 0,
    "performanceIssues": 0,
    "bestPracticeViolations": 0,
    "totalIssues": 0
  }
}

The score should be 0-100 where:
- 90-100: Excellent, production-ready code
- 70-89: Good, minor improvements needed
- 50-69: Fair, significant improvements needed
- 0-49: Poor, critical issues that need immediate attention

Be thorough but practical. Focus on D365-specific issues first, then general code quality.
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

            console.log(`[analyzeWebResource] Attempting with model: ${modelName}`);

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
                    console.warn(`[analyzeWebResource] Model ${modelName} failed: ${response.status} ${errorText}`);
                    lastError = new Error(`Model ${modelName} error: ${response.status} ${errorText}`);
                }
            } catch (e) {
                console.warn(`[analyzeWebResource] Network error with model ${modelName}:`, e);
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
            await ctx.runMutation(api.mutations.saveWebResourceAuditResult, {
                webResourceId: args.webResourceConvexId,
                tenantId: args.tenantId,
                result: cleanedText,
                model: successfulModel,
            });

            return result;
        } catch (e) {
            console.error("Failed to parse Claude web resource audit response:", generatedText);
            throw new Error("Failed to parse code analysis results from Claude.");
        }
    },
});
