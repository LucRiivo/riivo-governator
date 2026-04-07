
import { query } from "./_generated/server";

import { v } from "convex/values";

export const getFlows = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) {
            return await ctx.db.query("flows").collect();
        }
        return await ctx.db
            .query("flows")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getAuditResult = query({
    args: { flowId: v.id("flows") },
    handler: async (ctx, args) => {
        const result = await ctx.db
            .query("audit_results")
            .withIndex("by_flowId", (q) => q.eq("flowId", args.flowId))
            .order("desc")
            .first();
        return result;
    },
});

export const getFlowByExternalId = query({
    args: { workflowId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("flows")
            .withIndex("by_workflowId", (q) => q.eq("workflowId", args.workflowId))
            .unique();
    },
});

export const getTables = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) {
            return await ctx.db.query("tables").collect();
        }
        return await ctx.db
            .query("tables")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getTenants = query({
    args: { orgId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        if (args.orgId) {
            return await ctx.db
                .query("tenants")
                .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
                .collect();
        } else {
            // Personal workspace (orgId is undefined/null)
            return await ctx.db
                .query("tenants")
                .filter((q) => q.eq(q.field("orgId"), undefined))
                .collect();
        }
    },
});

export const getFlowById = query({
    args: { flowId: v.id("flows") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.flowId);
    },
});

export const getConfluenceSettingsByUserId = query({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("confluence_settings")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .first();
    },
});

// ERD Queries
export const getErdDiagram = query({
    args: { tenantId: v.string(), appModuleId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("erd_diagrams")
            .withIndex("by_app", (q) => q.eq("tenantId", args.tenantId).eq("appModuleId", args.appModuleId))
            .first();
    },
});

// Bulk Documentation Job Queries
export const getBulkDocJob = query({
    args: { tenantId: v.string() },
    handler: async (ctx, args) => {
        const jobs = await ctx.db
            .query("bulk_doc_jobs")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .order("desc")
            .take(1);
        return jobs[0] ?? null;
    },
});

export const getBulkDocJobById = query({
    args: { jobId: v.id("bulk_doc_jobs") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.jobId);
    },
});

export const getFlowDocumentationStats = query({
    args: { tenantId: v.string() },
    handler: async (ctx, args) => {
        const flows = await ctx.db
            .query("flows")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .collect();

        const allDocs = await ctx.db.query("flow_documentation").collect();
        const flowIds = new Set(flows.map((f) => f._id));
        const docs = allDocs.filter((d) => flowIds.has(d.flowId));

        return {
            totalFlows: flows.length,
            withDefinitions: flows.filter((f) => !!f.clientData).length,
            documented: docs.length,
            published: docs.filter((d) => !!d.confluencePageId).length,
        };
    },
});

// Phase 1: Security Queries
export const getBusinessUnits = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        return await ctx.db
            .query("business_units")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getSecurityRoles = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        return await ctx.db
            .query("security_roles")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getSecurityTeams = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        return await ctx.db
            .query("security_teams")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getSecurityAuditResult = query({
    args: { tenantId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("security_audit_results")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .order("desc")
            .first();
    },
});

// Phase 3: App Landscape Queries
export const getModelDrivenApps = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        return await ctx.db
            .query("model_driven_apps")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getSystemForms = query({
    args: { tenantId: v.optional(v.string()), entityLogicalName: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        if (args.entityLogicalName) {
            return await ctx.db
                .query("system_forms")
                .withIndex("by_entity", (q) =>
                    q.eq("tenantId", args.tenantId as string).eq("entityLogicalName", args.entityLogicalName as string)
                )
                .collect();
        }
        return await ctx.db
            .query("system_forms")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getSystemViews = query({
    args: { tenantId: v.optional(v.string()), entityLogicalName: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        if (args.entityLogicalName) {
            return await ctx.db
                .query("system_views")
                .withIndex("by_entity", (q) =>
                    q.eq("tenantId", args.tenantId as string).eq("entityLogicalName", args.entityLogicalName as string)
                )
                .collect();
        }
        return await ctx.db
            .query("system_views")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getAppLandscapeAuditResult = query({
    args: { tenantId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("app_landscape_audit_results")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .order("desc")
            .first();
    },
});

export const getAppAuditResult = query({
    args: { appId: v.id("model_driven_apps") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("app_audit_results")
            .withIndex("by_appId", (q) => q.eq("appId", args.appId))
            .order("desc")
            .first();
    },
});

// Phase 4: App Telemetry Queries
export const getAppInsightsConnection = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return null;
        return await ctx.db
            .query("app_insights_connections")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .first();
    },
});

export const getTelemetrySnapshot = query({
    args: { tenantId: v.string(), queryType: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("telemetry_snapshots")
            .withIndex("by_tenant_query", (q) =>
                q.eq("tenantId", args.tenantId).eq("queryType", args.queryType)
            )
            .first();
    },
});

export const getAllTelemetrySnapshots = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        return await ctx.db
            .query("telemetry_snapshots")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

// Phase 2: Web Resource Queries
export const getWebResources = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        return await ctx.db
            .query("web_resources")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getWebResourceAuditResult = query({
    args: { webResourceId: v.id("web_resources") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("web_resource_audit_results")
            .withIndex("by_webResourceId", (q) => q.eq("webResourceId", args.webResourceId))
            .order("desc")
            .first();
    },
});

// Migration helper: get all PP Admin connections (no tenant filter)
export const getAllPPAdminConnections = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("pp_admin_connections").collect();
    },
});

// Migration helper: get all App Insights connections (no tenant filter)
export const getAllAppInsightsConnections = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("app_insights_connections").collect();
    },
});

// Phase 5: Environment Storage Queries
export const getPPAdminConnection = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return null;
        return await ctx.db
            .query("pp_admin_connections")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .first();
    },
});

export const getEnvironmentStorage = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        return await ctx.db
            .query("environment_storage")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .collect();
    },
});

export const getStorageAuditResult = query({
    args: { tenantId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("storage_audit_results")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .order("desc")
            .first();
    },
});

// Phase 6: Environment Health Dashboard Queries
export const getHealthSnapshot = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return null;
        return await ctx.db
            .query("health_snapshots")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .order("desc")
            .first();
    },
});

export const getHealthSnapshots = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        return await ctx.db
            .query("health_snapshots")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .order("desc")
            .collect();
    },
});

export const getAdvisories = query({
    args: { tenantId: v.optional(v.string()), status: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return [];
        if (args.status) {
            return await ctx.db
                .query("advisories")
                .withIndex("by_tenant_status", (q) =>
                    q.eq("tenantId", args.tenantId as string).eq("status", args.status as string)
                )
                .order("desc")
                .collect();
        }
        return await ctx.db
            .query("advisories")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId as string))
            .order("desc")
            .collect();
    },
});

export const getEnvironmentHealthSummary = query({
    args: { tenantId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.tenantId) return null;
        const tid = args.tenantId as string;

        const [
            flows,
            tables,
            businessUnits,
            securityRoles,
            securityTeams,
            webResources,
            modelDrivenApps,
            systemForms,
            systemViews,
            environmentStorage,
        ] = await Promise.all([
            ctx.db.query("flows").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
            ctx.db.query("tables").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
            ctx.db.query("business_units").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
            ctx.db.query("security_roles").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
            ctx.db.query("security_teams").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
            ctx.db.query("web_resources").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
            ctx.db.query("model_driven_apps").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
            ctx.db.query("system_forms").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
            ctx.db.query("system_views").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
            ctx.db.query("environment_storage").withIndex("by_tenant", (q) => q.eq("tenantId", tid)).collect(),
        ]);

        const appInsightsConn = await ctx.db
            .query("app_insights_connections")
            .withIndex("by_tenant", (q) => q.eq("tenantId", tid))
            .first();
        const ppAdminConn = await ctx.db
            .query("pp_admin_connections")
            .withIndex("by_tenant", (q) => q.eq("tenantId", tid))
            .first();

        return {
            counts: {
                flows: flows.length,
                tables: tables.length,
                businessUnits: businessUnits.length,
                securityRoles: securityRoles.length,
                securityTeams: securityTeams.length,
                webResources: webResources.length,
                jsWebResources: webResources.filter((w) => w.webResourceType === 3).length,
                modelDrivenApps: modelDrivenApps.length,
                systemForms: systemForms.length,
                systemViews: systemViews.length,
                environments: environmentStorage.length,
            },
            connections: {
                appInsights: !!appInsightsConn,
                ppAdmin: !!ppAdminConn,
            },
            securityDetails: {
                disabledBUs: businessUnits.filter((bu) => bu.isDisabled).length,
                managedRoles: securityRoles.filter((r) => r.isManaged).length,
                customRoles: securityRoles.filter((r) => !r.isManaged).length,
                ownerTeams: securityTeams.filter((t) => t.teamType === 0).length,
                accessTeams: securityTeams.filter((t) => t.teamType === 1).length,
                aadTeams: securityTeams.filter((t) => t.teamType === 2 || t.teamType === 3).length,
            },
            webResourceDetails: {
                managed: webResources.filter((w) => w.isManaged).length,
                unmanaged: webResources.filter((w) => !w.isManaged).length,
            },
            appDetails: {
                managedApps: modelDrivenApps.filter((a) => a.isManaged).length,
                unmanagedApps: modelDrivenApps.filter((a) => !a.isManaged).length,
                managedForms: systemForms.filter((f) => f.isManaged).length,
                customForms: systemForms.filter((f) => !f.isManaged).length,
            },
            storageDetails: environmentStorage.map((e) => ({
                envName: e.envName,
                envType: e.envType,
                dbCapacityMB: e.dbCapacityMB,
                fileCapacityMB: e.fileCapacityMB,
                logCapacityMB: e.logCapacityMB,
            })),
        };
    },
});
