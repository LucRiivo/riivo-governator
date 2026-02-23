"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { decrypt } from "../lib/crypto";
const { api } = require("../_generated/api") as any;

const APP_INSIGHTS_BASE = "https://api.applicationinsights.io/v1/apps";

interface AppInsightsConnection {
    appInsightsAppId: string;
    apiKey: string;
    tenantId: string;
}

async function resolveAppInsightsConnection(
    ctx: any,
    tenantId: string,
    orgId?: string
): Promise<AppInsightsConnection> {
    const connection = await ctx.runQuery(api.queries.getAppInsightsConnection, { tenantId });
    if (!connection) {
        throw new Error("No Application Insights connection configured for this tenant. Go to Settings > App Insights to connect.");
    }
    return { ...connection, apiKey: decrypt(connection.apiKey) };
}

async function executeKqlQuery(
    appId: string,
    apiKey: string,
    kqlQuery: string,
    timespan?: string
): Promise<any> {
    const url = `${APP_INSIGHTS_BASE}/${appId}/query`;

    const body: any = { query: kqlQuery };
    if (timespan) body.timespan = timespan;

    console.log(`[telemetry] Executing KQL query against App Insights: ${kqlQuery.substring(0, 100)}...`);

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[telemetry] App Insights error ${response.status}: ${errorText}`);
        throw new Error(`Application Insights query failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return parseAppInsightsResponse(data);
}

function parseAppInsightsResponse(data: any): any[] {
    if (!data.tables || data.tables.length === 0) return [];
    const table = data.tables[0];
    const columns = table.columns.map((c: any) => c.name);
    return table.rows.map((row: any[]) => {
        const obj: any = {};
        columns.forEach((col: string, i: number) => {
            obj[col] = row[i];
        });
        return obj;
    });
}

// Test the Application Insights connection
export const testAppInsightsConnection = action({
    args: {
        appInsightsAppId: v.string(),
        apiKey: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            const results = await executeKqlQuery(
                args.appInsightsAppId,
                args.apiKey,
                "requests | take 1"
            );
            return { success: true, message: "Connection successful" };
        } catch (error: any) {
            return { success: false, message: error.message || "Connection failed" };
        }
    },
});

// Fetch slow page loads from Application Insights
export const fetchSlowPages = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
        timespan: v.optional(v.string()), // e.g. "P7D" for 7 days, "P30D" for 30 days
    },
    handler: async (ctx, args) => {
        const conn = await resolveAppInsightsConnection(ctx, args.tenantId, args.orgId);
        const timespan = args.timespan || "P7D";

        const kql = `
pageViews
| where timestamp > ago(7d)
| where duration > 0
| summarize avgDuration = avg(duration), p95Duration = percentile(duration, 95), requestCount = count() by name
| where requestCount > 2
| order by avgDuration desc
| take 50
`;

        const results = await executeKqlQuery(conn.appInsightsAppId, conn.apiKey, kql, timespan);

        // Cache the results
        await ctx.runMutation(api.mutations.saveTelemetrySnapshot, {
            tenantId: args.tenantId,
            queryType: "slow_pages",
            result: JSON.stringify(results),
        });

        return results;
    },
});

// Fetch JavaScript errors from Application Insights
export const fetchJsErrors = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
        timespan: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const conn = await resolveAppInsightsConnection(ctx, args.tenantId, args.orgId);
        const timespan = args.timespan || "P7D";

        const kql = `
exceptions
| where timestamp > ago(7d)
| summarize errorCount = count(), lastSeen = max(timestamp), firstSeen = min(timestamp) by type, outerMessage, problemId
| order by errorCount desc
| take 50
`;

        const results = await executeKqlQuery(conn.appInsightsAppId, conn.apiKey, kql, timespan);

        await ctx.runMutation(api.mutations.saveTelemetrySnapshot, {
            tenantId: args.tenantId,
            queryType: "js_errors",
            result: JSON.stringify(results),
        });

        return results;
    },
});

// Fetch plugin performance from Application Insights
export const fetchPluginPerformance = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
        timespan: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const conn = await resolveAppInsightsConnection(ctx, args.tenantId, args.orgId);
        const timespan = args.timespan || "P7D";

        const kql = `
customEvents
| where timestamp > ago(7d)
| where name contains "Plugin" or name contains "plugin" or name contains "CustomAPI"
| extend pluginName = tostring(customDimensions.PluginName), execDuration = todouble(customDimensions.Duration)
| where isnotempty(pluginName)
| summarize avgDuration = avg(execDuration), maxDuration = max(execDuration), execCount = count() by pluginName
| where execCount > 1
| order by avgDuration desc
| take 50
`;

        const results = await executeKqlQuery(conn.appInsightsAppId, conn.apiKey, kql, timespan);

        await ctx.runMutation(api.mutations.saveTelemetrySnapshot, {
            tenantId: args.tenantId,
            queryType: "plugin_performance",
            result: JSON.stringify(results),
        });

        return results;
    },
});

// Fetch overview/summary metrics from Application Insights
export const fetchTelemetryOverview = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
        timespan: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const conn = await resolveAppInsightsConnection(ctx, args.tenantId, args.orgId);
        const timespan = args.timespan || "P7D";

        // Run multiple queries for overview metrics
        const [pageMetrics, errorMetrics, requestMetrics, availabilityMetrics] = await Promise.all([
            // Average page load time
            executeKqlQuery(conn.appInsightsAppId, conn.apiKey, `
pageViews
| where timestamp > ago(7d)
| summarize avgPageLoad = avg(duration), p95PageLoad = percentile(duration, 95), totalPageViews = count()
`, timespan),
            // Error rate
            executeKqlQuery(conn.appInsightsAppId, conn.apiKey, `
exceptions
| where timestamp > ago(7d)
| summarize totalErrors = count(), uniqueErrors = dcount(problemId)
`, timespan),
            // Request performance
            executeKqlQuery(conn.appInsightsAppId, conn.apiKey, `
requests
| where timestamp > ago(7d)
| summarize avgDuration = avg(duration), totalRequests = count(), failedRequests = countif(success == false)
`, timespan),
            // Availability / user sessions
            executeKqlQuery(conn.appInsightsAppId, conn.apiKey, `
pageViews
| where timestamp > ago(7d)
| summarize uniqueUsers = dcount(user_Id), totalSessions = dcount(session_Id)
`, timespan),
        ]);

        const overview = {
            avgPageLoad: pageMetrics[0]?.avgPageLoad || 0,
            p95PageLoad: pageMetrics[0]?.p95PageLoad || 0,
            totalPageViews: pageMetrics[0]?.totalPageViews || 0,
            totalErrors: errorMetrics[0]?.totalErrors || 0,
            uniqueErrors: errorMetrics[0]?.uniqueErrors || 0,
            avgRequestDuration: requestMetrics[0]?.avgDuration || 0,
            totalRequests: requestMetrics[0]?.totalRequests || 0,
            failedRequests: requestMetrics[0]?.failedRequests || 0,
            uniqueUsers: availabilityMetrics[0]?.uniqueUsers || 0,
            totalSessions: availabilityMetrics[0]?.totalSessions || 0,
        };

        await ctx.runMutation(api.mutations.saveTelemetrySnapshot, {
            tenantId: args.tenantId,
            queryType: "overview",
            result: JSON.stringify(overview),
        });

        return overview;
    },
});

// Fetch all telemetry data in one batch
export const syncAllTelemetry = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
        timespan: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        console.log(`[syncAllTelemetry] Syncing all telemetry for tenant: ${args.tenantId}`);

        const [overview, slowPages, jsErrors, pluginPerf] = await Promise.all([
            ctx.runAction(api.actions.telemetry.fetchTelemetryOverview, {
                tenantId: args.tenantId, orgId: args.orgId, timespan: args.timespan,
            }),
            ctx.runAction(api.actions.telemetry.fetchSlowPages, {
                tenantId: args.tenantId, orgId: args.orgId, timespan: args.timespan,
            }),
            ctx.runAction(api.actions.telemetry.fetchJsErrors, {
                tenantId: args.tenantId, orgId: args.orgId, timespan: args.timespan,
            }),
            ctx.runAction(api.actions.telemetry.fetchPluginPerformance, {
                tenantId: args.tenantId, orgId: args.orgId, timespan: args.timespan,
            }),
        ]);

        return {
            overview,
            slowPages: slowPages.length,
            jsErrors: jsErrors.length,
            pluginPerformance: pluginPerf.length,
        };
    },
});
