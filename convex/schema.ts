
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    users: defineTable({
        name: v.string(),
        email: v.string(),
        tokenIdentifier: v.string(),
        orgIds: v.array(v.string()), // List of Clerk Org IDs this user belongs to
        isAllowed: v.boolean(), // Allowlist check
    }).index("by_token", ["tokenIdentifier"])
        .index("by_email", ["email"]),
    tenants: defineTable({
        name: v.string(),
        url: v.string(),
        clientId: v.string(),
        clientSecret: v.string(),
        tenantId: v.string(),
        tenantDirectoryId: v.optional(v.string()), // Azure AD Tenant ID (GUID)
        orgId: v.optional(v.string()), // Clerk Organization ID
    }).index("by_orgId", ["orgId"]),
    flows: defineTable({
        tenantId: v.string(), // Link to tenant
        workflowId: v.string(), // External ID from Dynamics
        name: v.string(),
        type: v.string(), // 'Cloud Flow'
        status: v.string(), // 'Active', 'Warning'
        clientData: v.optional(v.string()), // JSON definition of the flow
        logic: v.object({
            trigger: v.string(),
            steps: v.number()
        }),
        connRefs: v.number(),
        lastSynced: v.number(),
        lastAudited: v.optional(v.number()), // Timestamp of last audit
    })
        .index("by_tenant", ["tenantId"])
        .index("by_workflowId", ["workflowId"]), // Check if we already have it
    tables: defineTable({
        tenantId: v.string(),
        name: v.string(),
        logicalName: v.string(),
        entitySetName: v.string(),
        description: v.optional(v.string()),
        columns: v.number(),
        lastSynced: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_logicalName", ["logicalName"]),
    audit_results: defineTable({
        flowId: v.id("flows"),
        result: v.string(), // JSON result
        timestamp: v.number(),
        model: v.optional(v.string()),
    }).index("by_flowId", ["flowId"]),
    flow_documentation: defineTable({
        flowId: v.id("flows"),
        content: v.string(), // Markdown content
        status: v.string(), // 'draft', 'published'
        confluencePageId: v.optional(v.string()), // ID of the page in Confluence if published
        confluenceUrl: v.optional(v.string()), // URL to the published page
        lastUpdated: v.number(),
    }).index("by_flowId", ["flowId"]),
    confluence_settings: defineTable({
        userId: v.string(), // Clerk User ID
        domain: v.string(), // e.g. 'company.atlassian.net'
        email: v.string(),
        apiToken: v.string(),
        spaceKey: v.optional(v.string()), // Confluence Space Key
        parentId: v.optional(v.string()), // Parent Page ID for hierarchy
    }).index("by_userId", ["userId"]),

    // Phase 1: Security Overview
    business_units: defineTable({
        tenantId: v.string(),
        businessUnitId: v.string(), // External D365 GUID
        name: v.string(),
        parentBusinessUnitId: v.optional(v.string()),
        isDisabled: v.boolean(),
        lastSynced: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_businessUnitId", ["businessUnitId"]),
    security_roles: defineTable({
        tenantId: v.string(),
        roleId: v.string(), // External D365 GUID
        name: v.string(),
        businessUnitId: v.optional(v.string()),
        isManaged: v.optional(v.boolean()),
        isCustomizable: v.optional(v.boolean()),
        lastSynced: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_roleId", ["roleId"]),
    security_teams: defineTable({
        tenantId: v.string(),
        teamId: v.string(), // External D365 GUID
        name: v.string(),
        teamType: v.number(), // 0=Owner, 1=Access, 2=AAD Security, 3=AAD Office
        businessUnitId: v.optional(v.string()),
        isDefault: v.optional(v.boolean()),
        roles: v.array(v.object({ roleId: v.string(), name: v.string() })),
        lastSynced: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_teamId", ["teamId"]),
    security_audit_results: defineTable({
        tenantId: v.string(),
        result: v.string(), // JSON result from Claude
        timestamp: v.number(),
        model: v.optional(v.string()),
    }).index("by_tenant", ["tenantId"]),

    // Phase 2: Web Resources
    web_resources: defineTable({
        tenantId: v.string(),
        webResourceId: v.string(), // External D365 GUID
        name: v.string(), // Schema name e.g. "new_/scripts/account.js"
        displayName: v.optional(v.string()),
        webResourceType: v.number(), // 1=HTML, 2=CSS, 3=JScript, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=XAP, 9=XSL, 10=ICO, 11=SVG, 12=RESX
        description: v.optional(v.string()),
        isManaged: v.boolean(),
        modifiedOn: v.optional(v.string()),
        sizeBytes: v.optional(v.number()), // Approximate size from base64 content length
        lastSynced: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_webResourceId", ["webResourceId"]),
    web_resource_audit_results: defineTable({
        webResourceId: v.id("web_resources"), // Convex doc ID
        tenantId: v.string(),
        result: v.string(), // JSON result from Claude
        timestamp: v.number(),
        model: v.optional(v.string()),
    }).index("by_webResourceId", ["webResourceId"])
        .index("by_tenant", ["tenantId"]),

    // Phase 3: Model-Driven App Landscape
    model_driven_apps: defineTable({
        tenantId: v.string(),
        appModuleId: v.string(), // External D365 GUID
        name: v.string(),
        uniqueName: v.optional(v.string()),
        description: v.optional(v.string()),
        appVersion: v.optional(v.string()),
        publishedOn: v.optional(v.string()),
        clientType: v.optional(v.number()), // 4=Web, 5=Unified Interface
        isManaged: v.optional(v.boolean()),
        lastSynced: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_appModuleId", ["appModuleId"]),
    system_forms: defineTable({
        tenantId: v.string(),
        formId: v.string(), // External D365 GUID
        name: v.string(),
        entityLogicalName: v.string(), // objecttypecode
        formType: v.number(), // 2=Main, 5=Mobile, 6=Quick View, 7=Quick Create, 11=Main Interactive
        description: v.optional(v.string()),
        isManaged: v.boolean(),
        lastSynced: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_formId", ["formId"])
        .index("by_entity", ["tenantId", "entityLogicalName"]),
    system_views: defineTable({
        tenantId: v.string(),
        viewId: v.string(), // External D365 GUID (savedqueryid)
        name: v.string(),
        entityLogicalName: v.string(), // returnedtypecode
        queryType: v.number(), // 0=Public View, 1=Advanced Find, etc.
        isManaged: v.boolean(),
        isDefault: v.optional(v.boolean()),
        lastSynced: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_viewId", ["viewId"])
        .index("by_entity", ["tenantId", "entityLogicalName"]),
    app_landscape_audit_results: defineTable({
        tenantId: v.string(),
        result: v.string(), // JSON result from Claude
        timestamp: v.number(),
        model: v.optional(v.string()),
    }).index("by_tenant", ["tenantId"]),
    app_audit_results: defineTable({
        appId: v.id("model_driven_apps"), // Convex doc ID for the app
        tenantId: v.string(),
        result: v.string(), // JSON result from Claude
        timestamp: v.number(),
        model: v.optional(v.string()),
    }).index("by_appId", ["appId"])
        .index("by_tenant", ["tenantId"]),

    // Phase 4: App Telemetry (Application Insights)
    app_insights_connections: defineTable({
        tenantId: v.string(), // Links to the D365 tenant
        appInsightsAppId: v.string(), // Application Insights Application ID
        apiKey: v.string(), // Application Insights API Key (read-only)
        displayName: v.optional(v.string()), // Friendly label
        orgId: v.optional(v.string()), // Clerk Organization ID
        lastTestedAt: v.optional(v.number()), // Last successful connection test
    }).index("by_tenant", ["tenantId"])
        .index("by_orgId", ["orgId"]),
    telemetry_snapshots: defineTable({
        tenantId: v.string(),
        queryType: v.string(), // "slow_pages" | "js_errors" | "plugin_performance" | "overview"
        result: v.string(), // JSON stringified query results
        timestamp: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_tenant_query", ["tenantId", "queryType"]),

    // Phase 5: Environment Storage
    pp_admin_connections: defineTable({
        tenantId: v.string(), // Links to the D365 tenant
        ppTenantId: v.string(), // Azure AD Tenant ID for Power Platform Admin API
        clientId: v.string(), // Azure AD App Registration Client ID
        clientSecret: v.string(), // Azure AD App Registration Client Secret
        displayName: v.optional(v.string()), // Friendly label
        orgId: v.optional(v.string()), // Clerk Organization ID
        lastTestedAt: v.optional(v.number()), // Last successful connection test
    }).index("by_tenant", ["tenantId"])
        .index("by_orgId", ["orgId"]),
    environment_storage: defineTable({
        tenantId: v.string(), // Links to the D365 tenant
        envId: v.string(), // Power Platform environment ID
        envName: v.string(), // Environment display name
        envType: v.optional(v.string()), // Production, Sandbox, Developer, etc.
        envState: v.optional(v.string()), // Ready, Preparing, etc.
        dbCapacityMB: v.number(), // Database capacity in MB
        fileCapacityMB: v.number(), // File capacity in MB
        logCapacityMB: v.number(), // Log capacity in MB
        dbUsedMB: v.optional(v.number()), // Database used in MB
        fileUsedMB: v.optional(v.number()), // File used in MB
        logUsedMB: v.optional(v.number()), // Log used in MB
        tableBreakdown: v.optional(v.string()), // JSON array of table storage data
        snapshotDate: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_envId", ["tenantId", "envId"]),
    storage_audit_results: defineTable({
        tenantId: v.string(),
        result: v.string(), // JSON result from Claude
        timestamp: v.number(),
        model: v.optional(v.string()),
    }).index("by_tenant", ["tenantId"]),

    // ERD (Entity Relationship Diagram) - per model-driven app
    erd_diagrams: defineTable({
        tenantId: v.string(),
        appModuleId: v.string(), // D365 app module GUID
        mermaidCode: v.string(), // Mermaid ERD source code
        status: v.string(), // 'draft' | 'published'
        confluencePageId: v.optional(v.string()),
        confluenceUrl: v.optional(v.string()),
        lastGenerated: v.number(),
    }).index("by_tenant", ["tenantId"])
      .index("by_app", ["tenantId", "appModuleId"]),

    // Security Documentation
    security_documentation: defineTable({
        tenantId: v.string(),
        content: v.string(),
        status: v.string(), // 'draft' | 'published'
        confluencePageId: v.optional(v.string()),
        confluenceUrl: v.optional(v.string()),
        lastUpdated: v.number(),
    }).index("by_tenant", ["tenantId"]),

    // App Documentation (per model-driven app)
    app_documentation: defineTable({
        appId: v.id("model_driven_apps"),
        content: v.string(),
        status: v.string(),
        confluencePageId: v.optional(v.string()),
        confluenceUrl: v.optional(v.string()),
        lastUpdated: v.number(),
    }).index("by_appId", ["appId"]),

    // Web Resource Documentation (per web resource)
    web_resource_documentation: defineTable({
        webResourceId: v.id("web_resources"),
        content: v.string(),
        status: v.string(),
        confluencePageId: v.optional(v.string()),
        confluenceUrl: v.optional(v.string()),
        lastUpdated: v.number(),
    }).index("by_webResourceId", ["webResourceId"]),

    // Bulk Documentation Jobs
    bulk_doc_jobs: defineTable({
        tenantId: v.string(),
        phase: v.string(),          // 'fetching' | 'generating' | 'publishing' | 'done'
        status: v.string(),         // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
        totalFlows: v.number(),
        completedFlows: v.number(),
        publishedFlows: v.number(),
        failedFlows: v.number(),
        skippedFlows: v.number(),
        errors: v.array(v.object({
            flowId: v.string(),
            flowName: v.string(),
            phase: v.string(),      // 'fetch' | 'generate' | 'publish'
            error: v.string(),
        })),
        startedAt: v.number(),
        completedAt: v.optional(v.number()),
        requestedBy: v.string(),
    }).index("by_tenant", ["tenantId"]),

    // Phase 6: Environment Health Dashboard
    health_snapshots: defineTable({
        tenantId: v.string(),
        overallScore: v.number(), // 0-100
        categoryScores: v.string(), // JSON: { security, codeQuality, appHealth, performance, storage }
        issuesSummary: v.string(), // JSON: { critical, warning, info }
        timestamp: v.number(),
    }).index("by_tenant", ["tenantId"]),
    advisories: defineTable({
        tenantId: v.string(),
        category: v.string(), // "security" | "codeQuality" | "appHealth" | "performance" | "storage"
        severity: v.string(), // "critical" | "warning" | "info"
        title: v.string(),
        description: v.string(),
        remediation: v.string(), // Step-by-step fix
        status: v.string(), // "open" | "resolved" | "dismissed"
        timestamp: v.number(),
    }).index("by_tenant", ["tenantId"])
        .index("by_tenant_category", ["tenantId", "category"])
        .index("by_tenant_status", ["tenantId", "status"]),
});
