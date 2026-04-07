import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const _addTenant = internalMutation({
    args: {
        name: v.string(),
        url: v.string(),
        clientId: v.string(),
        clientSecret: v.string(),
        tenantDirectoryId: v.optional(v.string()),
        orgId: v.optional(v.string()), // Add orgId
    },
    handler: async (ctx, args) => {
        // Extract tenant ID from URL if possible, or leave blank/generate placeholder
        // For simplicity, we just store what we have. 
        // In a real app we might validate or parse the URL better.
        const tenantId = "auto-generated-" + Math.random().toString(36).substring(7);

        const newTenantId = await ctx.db.insert("tenants", {
            name: args.name,
            url: args.url,
            clientId: args.clientId,
            clientSecret: args.clientSecret,
            tenantId: tenantId, // Internal unique ID
            tenantDirectoryId: args.tenantDirectoryId,
            orgId: args.orgId,
        });
        return newTenantId;
    },
});

export const deleteTenant = mutation({
    args: { id: v.id("tenants") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const upsertFlows = mutation({
    args: {
        tenantId: v.string(),
        flows: v.array(v.object({
            workflowId: v.string(),
            name: v.string(),
            type: v.string(),
            status: v.string(),
            clientData: v.optional(v.string()),
            logic: v.object({
                trigger: v.string(),
                steps: v.number()
            }),
            connRefs: v.number(),
        }))
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const flow of args.flows) {
            // Check if flow exists
            const existing = await ctx.db
                .query("flows")
                .withIndex("by_workflowId", (q) => q.eq("workflowId", flow.workflowId))
                .first();

            if (existing) {
                // Update
                const patch: any = {
                    ...flow,
                    tenantId: args.tenantId,
                    lastSynced: timestamp
                };

                // Preserve existing logic and clientData if the new one is empty/placeholder
                if (!flow.clientData && existing.clientData) {
                    delete patch.clientData; // Don't overwrite with undefined

                    // If we have existing logic derived from clientData, keep it instead of "Unknown"
                    if (flow.logic.trigger === "Unknown" && existing.logic && existing.logic.trigger !== "Unknown") {
                        delete patch.logic;
                    }
                }

                await ctx.db.patch(existing._id, patch);
            } else {
                // Insert
                await ctx.db.insert("flows", {
                    ...flow,
                    tenantId: args.tenantId,
                    lastSynced: timestamp
                });
            }
        }
    }
});

export const saveAuditResult = mutation({
    args: {
        flowId: v.id("flows"),
        result: v.string(),
        model: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        await ctx.db.insert("audit_results", {
            flowId: args.flowId,
            result: args.result,
            timestamp: timestamp,
            model: args.model
        });

        // Update flow with lastAudited timestamp
        await ctx.db.patch(args.flowId, {
            lastAudited: timestamp
        });
    }
});

export const upsertTables = mutation({
    args: {
        tenantId: v.string(),
        tables: v.array(v.object({
            logicalName: v.string(),
            name: v.string(),
            entitySetName: v.string(),
            description: v.optional(v.string()),
            columns: v.number(),
        }))
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const table of args.tables) {
            // Check if table exists by logicalName
            const existing = await ctx.db
                .query("tables")
                .withIndex("by_logicalName", (q) => q.eq("logicalName", table.logicalName))
                .first();

            if (existing) {
                // Update existing table
                await ctx.db.patch(existing._id, {
                    ...table,
                    tenantId: args.tenantId,
                    lastSynced: timestamp
                });
            } else {
                // Insert new table
                await ctx.db.insert("tables", {
                    ...table,
                    tenantId: args.tenantId,
                    lastSynced: timestamp
                });
            }
        }
    }
});

export const updateFlowClientData = mutation({
    args: {
        flowId: v.id("flows"),
        clientData: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.flowId, {
            clientData: args.clientData,
            lastSynced: Date.now()
        });
    }
});

// ERD Mutations
export const saveErdDiagram = mutation({
    args: {
        tenantId: v.string(),
        appModuleId: v.string(),
        mermaidCode: v.string(),
        status: v.string(),
        confluencePageId: v.optional(v.string()),
        confluenceUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("erd_diagrams")
            .withIndex("by_app", (q) => q.eq("tenantId", args.tenantId).eq("appModuleId", args.appModuleId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                mermaidCode: args.mermaidCode,
                status: args.status,
                confluencePageId: args.confluencePageId ?? existing.confluencePageId,
                confluenceUrl: args.confluenceUrl ?? existing.confluenceUrl,
                lastGenerated: Date.now(),
            });
        } else {
            await ctx.db.insert("erd_diagrams", {
                tenantId: args.tenantId,
                appModuleId: args.appModuleId,
                mermaidCode: args.mermaidCode,
                status: args.status,
                confluencePageId: args.confluencePageId,
                confluenceUrl: args.confluenceUrl,
                lastGenerated: Date.now(),
            });
        }
    },
});

// Bulk Documentation Job Mutations
export const createBulkDocJob = mutation({
    args: {
        tenantId: v.string(),
        totalFlows: v.number(),
        requestedBy: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("bulk_doc_jobs", {
            tenantId: args.tenantId,
            phase: "fetching",
            status: "running",
            totalFlows: args.totalFlows,
            completedFlows: 0,
            publishedFlows: 0,
            failedFlows: 0,
            skippedFlows: 0,
            errors: [],
            startedAt: Date.now(),
            requestedBy: args.requestedBy,
        });
    },
});

export const updateBulkDocJobProgress = mutation({
    args: {
        jobId: v.id("bulk_doc_jobs"),
        completedFlows: v.optional(v.number()),
        publishedFlows: v.optional(v.number()),
        failedFlows: v.optional(v.number()),
        skippedFlows: v.optional(v.number()),
        newErrors: v.optional(v.array(v.object({
            flowId: v.string(),
            flowName: v.string(),
            phase: v.string(),
            error: v.string(),
        }))),
    },
    handler: async (ctx, args) => {
        const job = await ctx.db.get(args.jobId);
        if (!job) throw new Error("Job not found");

        const patch: any = {};
        if (args.completedFlows !== undefined) patch.completedFlows = args.completedFlows;
        if (args.publishedFlows !== undefined) patch.publishedFlows = args.publishedFlows;
        if (args.failedFlows !== undefined) patch.failedFlows = args.failedFlows;
        if (args.skippedFlows !== undefined) patch.skippedFlows = args.skippedFlows;
        if (args.newErrors && args.newErrors.length > 0) {
            patch.errors = [...job.errors, ...args.newErrors];
        }

        await ctx.db.patch(args.jobId, patch);
    },
});

export const updateBulkDocJobPhase = mutation({
    args: {
        jobId: v.id("bulk_doc_jobs"),
        phase: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, { phase: args.phase });
    },
});

export const completeBulkDocJob = mutation({
    args: {
        jobId: v.id("bulk_doc_jobs"),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            phase: "done",
            status: args.status,
            completedAt: Date.now(),
        });
    },
});

export const cancelBulkDocJob = mutation({
    args: { jobId: v.id("bulk_doc_jobs") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            status: "cancelled",
            completedAt: Date.now(),
        });
    },
});

// Phase 1: Security Mutations
export const upsertBusinessUnits = mutation({
    args: {
        tenantId: v.string(),
        businessUnits: v.array(v.object({
            businessUnitId: v.string(),
            name: v.string(),
            parentBusinessUnitId: v.optional(v.string()),
            isDisabled: v.boolean(),
        }))
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const bu of args.businessUnits) {
            const existing = await ctx.db
                .query("business_units")
                .withIndex("by_businessUnitId", (q) => q.eq("businessUnitId", bu.businessUnitId))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, {
                    ...bu,
                    tenantId: args.tenantId,
                    lastSynced: timestamp,
                });
            } else {
                await ctx.db.insert("business_units", {
                    ...bu,
                    tenantId: args.tenantId,
                    lastSynced: timestamp,
                });
            }
        }
    }
});

export const upsertSecurityRoles = mutation({
    args: {
        tenantId: v.string(),
        roles: v.array(v.object({
            roleId: v.string(),
            name: v.string(),
            businessUnitId: v.optional(v.string()),
            isManaged: v.optional(v.boolean()),
            isCustomizable: v.optional(v.boolean()),
        }))
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const role of args.roles) {
            const existing = await ctx.db
                .query("security_roles")
                .withIndex("by_roleId", (q) => q.eq("roleId", role.roleId))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, {
                    ...role,
                    tenantId: args.tenantId,
                    lastSynced: timestamp,
                });
            } else {
                await ctx.db.insert("security_roles", {
                    ...role,
                    tenantId: args.tenantId,
                    lastSynced: timestamp,
                });
            }
        }
    }
});

export const upsertSecurityTeams = mutation({
    args: {
        tenantId: v.string(),
        teams: v.array(v.object({
            teamId: v.string(),
            name: v.string(),
            teamType: v.number(),
            businessUnitId: v.optional(v.string()),
            isDefault: v.optional(v.boolean()),
            roles: v.array(v.object({ roleId: v.string(), name: v.string() })),
        }))
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const team of args.teams) {
            const existing = await ctx.db
                .query("security_teams")
                .withIndex("by_teamId", (q) => q.eq("teamId", team.teamId))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, {
                    ...team,
                    tenantId: args.tenantId,
                    lastSynced: timestamp,
                });
            } else {
                await ctx.db.insert("security_teams", {
                    ...team,
                    tenantId: args.tenantId,
                    lastSynced: timestamp,
                });
            }
        }
    }
});

export const saveSecurityAuditResult = mutation({
    args: {
        tenantId: v.string(),
        result: v.string(),
        model: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("security_audit_results", {
            tenantId: args.tenantId,
            result: args.result,
            timestamp: Date.now(),
            model: args.model,
        });
    }
});

// Phase 3: App Landscape Mutations
export const upsertModelDrivenApps = mutation({
    args: {
        tenantId: v.string(),
        apps: v.array(v.object({
            appModuleId: v.string(),
            name: v.string(),
            uniqueName: v.optional(v.string()),
            description: v.optional(v.string()),
            appVersion: v.optional(v.string()),
            publishedOn: v.optional(v.string()),
            clientType: v.optional(v.number()),
            isManaged: v.optional(v.boolean()),
        }))
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const app of args.apps) {
            const existing = await ctx.db
                .query("model_driven_apps")
                .withIndex("by_appModuleId", (q) => q.eq("appModuleId", app.appModuleId))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, { ...app, tenantId: args.tenantId, lastSynced: timestamp });
            } else {
                await ctx.db.insert("model_driven_apps", { ...app, tenantId: args.tenantId, lastSynced: timestamp });
            }
        }
    }
});

export const upsertSystemForms = mutation({
    args: {
        tenantId: v.string(),
        forms: v.array(v.object({
            formId: v.string(),
            name: v.string(),
            entityLogicalName: v.string(),
            formType: v.number(),
            description: v.optional(v.string()),
            isManaged: v.boolean(),
        }))
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const form of args.forms) {
            const existing = await ctx.db
                .query("system_forms")
                .withIndex("by_formId", (q) => q.eq("formId", form.formId))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, { ...form, tenantId: args.tenantId, lastSynced: timestamp });
            } else {
                await ctx.db.insert("system_forms", { ...form, tenantId: args.tenantId, lastSynced: timestamp });
            }
        }
    }
});

export const upsertSystemViews = mutation({
    args: {
        tenantId: v.string(),
        views: v.array(v.object({
            viewId: v.string(),
            name: v.string(),
            entityLogicalName: v.string(),
            queryType: v.number(),
            isManaged: v.boolean(),
            isDefault: v.optional(v.boolean()),
        }))
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const view of args.views) {
            const existing = await ctx.db
                .query("system_views")
                .withIndex("by_viewId", (q) => q.eq("viewId", view.viewId))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, { ...view, tenantId: args.tenantId, lastSynced: timestamp });
            } else {
                await ctx.db.insert("system_views", { ...view, tenantId: args.tenantId, lastSynced: timestamp });
            }
        }
    }
});

export const saveAppLandscapeAuditResult = mutation({
    args: {
        tenantId: v.string(),
        result: v.string(),
        model: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("app_landscape_audit_results", {
            tenantId: args.tenantId,
            result: args.result,
            timestamp: Date.now(),
            model: args.model,
        });
    }
});

export const saveAppAuditResult = mutation({
    args: {
        appId: v.id("model_driven_apps"),
        tenantId: v.string(),
        result: v.string(),
        model: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("app_audit_results", {
            appId: args.appId,
            tenantId: args.tenantId,
            result: args.result,
            timestamp: Date.now(),
            model: args.model,
        });
    }
});

// Phase 2: Web Resource Mutations
export const upsertWebResources = mutation({
    args: {
        tenantId: v.string(),
        webResources: v.array(v.object({
            webResourceId: v.string(),
            name: v.string(),
            displayName: v.optional(v.string()),
            webResourceType: v.number(),
            description: v.optional(v.string()),
            isManaged: v.boolean(),
            modifiedOn: v.optional(v.string()),
            sizeBytes: v.optional(v.number()),
        }))
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const wr of args.webResources) {
            const existing = await ctx.db
                .query("web_resources")
                .withIndex("by_webResourceId", (q) => q.eq("webResourceId", wr.webResourceId))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, {
                    ...wr,
                    tenantId: args.tenantId,
                    lastSynced: timestamp,
                });
            } else {
                await ctx.db.insert("web_resources", {
                    ...wr,
                    tenantId: args.tenantId,
                    lastSynced: timestamp,
                });
            }
        }
    }
});

// Phase 4: App Insights Mutations
export const _saveAppInsightsConnection = internalMutation({
    args: {
        tenantId: v.string(),
        appInsightsAppId: v.string(),
        apiKey: v.string(),
        displayName: v.optional(v.string()),
        orgId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Upsert: check if connection already exists for this tenant
        const existing = await ctx.db
            .query("app_insights_connections")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                appInsightsAppId: args.appInsightsAppId,
                apiKey: args.apiKey,
                displayName: args.displayName,
                orgId: args.orgId,
                lastTestedAt: Date.now(),
            });
            return existing._id;
        } else {
            return await ctx.db.insert("app_insights_connections", {
                tenantId: args.tenantId,
                appInsightsAppId: args.appInsightsAppId,
                apiKey: args.apiKey,
                displayName: args.displayName,
                orgId: args.orgId,
                lastTestedAt: Date.now(),
            });
        }
    }
});

export const deleteAppInsightsConnection = mutation({
    args: { id: v.id("app_insights_connections") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const saveTelemetrySnapshot = mutation({
    args: {
        tenantId: v.string(),
        queryType: v.string(),
        result: v.string(),
    },
    handler: async (ctx, args) => {
        // Replace existing snapshot for same tenant+queryType
        const existing = await ctx.db
            .query("telemetry_snapshots")
            .withIndex("by_tenant_query", (q) =>
                q.eq("tenantId", args.tenantId).eq("queryType", args.queryType)
            )
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                result: args.result,
                timestamp: Date.now(),
            });
        } else {
            await ctx.db.insert("telemetry_snapshots", {
                tenantId: args.tenantId,
                queryType: args.queryType,
                result: args.result,
                timestamp: Date.now(),
            });
        }
    }
});

export const saveWebResourceAuditResult = mutation({
    args: {
        webResourceId: v.id("web_resources"),
        tenantId: v.string(),
        result: v.string(),
        model: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("web_resource_audit_results", {
            webResourceId: args.webResourceId,
            tenantId: args.tenantId,
            result: args.result,
            timestamp: Date.now(),
            model: args.model,
        });
    }
});

// Phase 5: Power Platform Admin Connection Mutations
export const _savePPAdminConnection = internalMutation({
    args: {
        tenantId: v.string(),
        ppTenantId: v.string(),
        clientId: v.string(),
        clientSecret: v.string(),
        displayName: v.optional(v.string()),
        orgId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("pp_admin_connections")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                ppTenantId: args.ppTenantId,
                clientId: args.clientId,
                clientSecret: args.clientSecret,
                displayName: args.displayName,
                orgId: args.orgId,
                lastTestedAt: Date.now(),
            });
            return existing._id;
        } else {
            return await ctx.db.insert("pp_admin_connections", {
                tenantId: args.tenantId,
                ppTenantId: args.ppTenantId,
                clientId: args.clientId,
                clientSecret: args.clientSecret,
                displayName: args.displayName,
                orgId: args.orgId,
                lastTestedAt: Date.now(),
            });
        }
    }
});

export const deletePPAdminConnection = mutation({
    args: { id: v.id("pp_admin_connections") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const upsertEnvironmentStorage = mutation({
    args: {
        tenantId: v.string(),
        environments: v.array(v.object({
            envId: v.string(),
            envName: v.string(),
            envType: v.optional(v.string()),
            envState: v.optional(v.string()),
            dbCapacityMB: v.number(),
            fileCapacityMB: v.number(),
            logCapacityMB: v.number(),
            dbUsedMB: v.optional(v.number()),
            fileUsedMB: v.optional(v.number()),
            logUsedMB: v.optional(v.number()),
            tableBreakdown: v.optional(v.string()),
        })),
    },
    handler: async (ctx, args) => {
        const timestamp = Date.now();
        for (const env of args.environments) {
            const existing = await ctx.db
                .query("environment_storage")
                .withIndex("by_envId", (q) =>
                    q.eq("tenantId", args.tenantId).eq("envId", env.envId)
                )
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, {
                    ...env,
                    tenantId: args.tenantId,
                    snapshotDate: timestamp,
                });
            } else {
                await ctx.db.insert("environment_storage", {
                    ...env,
                    tenantId: args.tenantId,
                    snapshotDate: timestamp,
                });
            }
        }
    }
});

export const saveStorageAuditResult = mutation({
    args: {
        tenantId: v.string(),
        result: v.string(),
        model: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("storage_audit_results", {
            tenantId: args.tenantId,
            result: args.result,
            timestamp: Date.now(),
            model: args.model,
        });
    }
});

// Phase 6: Health Dashboard Mutations
export const saveHealthSnapshot = mutation({
    args: {
        tenantId: v.string(),
        overallScore: v.number(),
        categoryScores: v.string(),
        issuesSummary: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("health_snapshots", {
            tenantId: args.tenantId,
            overallScore: args.overallScore,
            categoryScores: args.categoryScores,
            issuesSummary: args.issuesSummary,
            timestamp: Date.now(),
        });
    }
});

export const saveAdvisories = mutation({
    args: {
        tenantId: v.string(),
        advisories: v.array(v.object({
            category: v.string(),
            severity: v.string(),
            title: v.string(),
            description: v.string(),
            remediation: v.string(),
        })),
    },
    handler: async (ctx, args) => {
        // Clear existing open advisories for this tenant before inserting new ones
        const existing = await ctx.db
            .query("advisories")
            .withIndex("by_tenant_status", (q) =>
                q.eq("tenantId", args.tenantId).eq("status", "open")
            )
            .collect();
        for (const adv of existing) {
            await ctx.db.delete(adv._id);
        }

        for (const advisory of args.advisories) {
            await ctx.db.insert("advisories", {
                tenantId: args.tenantId,
                category: advisory.category,
                severity: advisory.severity,
                title: advisory.title,
                description: advisory.description,
                remediation: advisory.remediation,
                status: "open",
                timestamp: Date.now(),
            });
        }
    }
});

export const updateAdvisoryStatus = mutation({
    args: {
        advisoryId: v.id("advisories"),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.advisoryId, { status: args.status });
    }
});

// Migration patch mutations (used by migrateEncryptCredentials action)
export const _patchTenantSecret = internalMutation({
    args: { id: v.id("tenants"), clientSecret: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { clientSecret: args.clientSecret });
    },
});

export const _patchPPAdminSecret = internalMutation({
    args: { id: v.id("pp_admin_connections"), clientSecret: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { clientSecret: args.clientSecret });
    },
});

export const _patchAppInsightsKey = internalMutation({
    args: { id: v.id("app_insights_connections"), apiKey: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { apiKey: args.apiKey });
    },
});
