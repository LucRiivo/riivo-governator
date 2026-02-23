"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { decrypt } from "../lib/crypto";
import { getD365AccessToken, getPPAdminToken, type PPAdminConnection } from "../lib/tokenHelper";
const { api } = require("../_generated/api") as any;

const PP_ADMIN_BASE = "https://api.bap.microsoft.com";
const PP_API_VERSION = "2021-04-01";

async function resolvePPAdminConnection(
    ctx: any,
    tenantId: string
): Promise<PPAdminConnection> {
    const connection = await ctx.runQuery(api.queries.getPPAdminConnection, { tenantId });
    if (!connection) {
        throw new Error("No Power Platform Admin connection configured for this tenant. Go to Settings > PP Admin API to connect.");
    }
    return connection;
}

// Test the Power Platform Admin API connection
export const testPPAdminConnection = action({
    args: {
        ppTenantId: v.string(),
        clientId: v.string(),
        clientSecret: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            const token = await getPPAdminToken({
                ppTenantId: args.ppTenantId,
                clientId: args.clientId,
                clientSecret: args.clientSecret,
                tenantId: "",
            });

            // Try listing environments to verify access
            const url = `${PP_ADMIN_BASE}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=${PP_API_VERSION}&$top=1`;
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                return { success: false, message: `API access failed: ${response.status} - ${errorText.substring(0, 200)}` };
            }

            return { success: true, message: "Connection successful! Power Platform Admin API is accessible." };
        } catch (error: any) {
            return { success: false, message: error.message || "Connection failed" };
        }
    },
});

// Fetch environment list and storage capacity from Power Platform Admin API
export const fetchEnvironmentStorage = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        console.log(`[storage] Fetching environment storage for tenant: ${args.tenantId}`);
        const conn = await resolvePPAdminConnection(ctx, args.tenantId);
        const token = await getPPAdminToken({ ...conn, clientSecret: decrypt(conn.clientSecret) });

        // List all environments
        const envUrl = `${PP_ADMIN_BASE}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=${PP_API_VERSION}`;
        const envResponse = await fetch(envUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });

        if (!envResponse.ok) {
            const errorText = await envResponse.text();
            throw new Error(`Failed to list environments: ${envResponse.status} ${errorText.substring(0, 300)}`);
        }

        const envData = await envResponse.json();
        const environments = envData.value || [];

        console.log(`[storage] Found ${environments.length} environments`);

        const storageData = environments.map((env: any) => {
            const props = env.properties || {};
            const capacity = props.capacity || {};

            // Extract storage values - the API structure may vary
            const dbCapacity = capacity.databaseCapacity || props.databaseCapacity || 0;
            const fileCapacity = capacity.fileCapacity || props.fileCapacity || 0;
            const logCapacity = capacity.logCapacity || props.logCapacity || 0;
            const dbUsed = capacity.actualDatabaseConsumption || props.actualDatabaseConsumption || undefined;
            const fileUsed = capacity.actualFileConsumption || props.actualFileConsumption || undefined;
            const logUsed = capacity.actualLogConsumption || props.actualLogConsumption || undefined;

            return {
                envId: env.name || env.id || "",
                envName: props.displayName || props.friendlyName || env.name || "Unknown",
                envType: props.environmentType || props.environmentSku || undefined,
                envState: props.states?.runtime?.id || props.provisioningState || undefined,
                dbCapacityMB: typeof dbCapacity === "number" ? dbCapacity : 0,
                fileCapacityMB: typeof fileCapacity === "number" ? fileCapacity : 0,
                logCapacityMB: typeof logCapacity === "number" ? logCapacity : 0,
                dbUsedMB: typeof dbUsed === "number" ? dbUsed : undefined,
                fileUsedMB: typeof fileUsed === "number" ? fileUsed : undefined,
                logUsedMB: typeof logUsed === "number" ? logUsed : undefined,
            };
        });

        // Save to Convex
        await ctx.runMutation(api.mutations.upsertEnvironmentStorage, {
            tenantId: args.tenantId,
            environments: storageData,
        });

        return storageData;
    },
});

// Fetch table-level storage breakdown from D365 OData (uses D365 SP credentials)
export const fetchTableBreakdown = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        console.log(`[storage] Fetching table breakdown for tenant: ${args.tenantId}`);

        // Get the D365 tenant credentials
        const tenants = await ctx.runQuery(api.queries.getTenants, { orgId: args.orgId });
        const tenant = tenants.find((t: any) => t.tenantId === args.tenantId);
        if (!tenant) {
            throw new Error("Tenant not found");
        }

        const token = await getD365AccessToken(
            tenant.url,
            tenant.clientId,
            decrypt(tenant.clientSecret),
            tenant.tenantDirectoryId
        );

        const baseUrl = tenant.url.replace(/\/$/, "");

        // Fetch entity definitions to get table metadata
        const entityUrl = `${baseUrl}/api/data/v9.2/EntityDefinitions?$select=LogicalName,DisplayName,EntitySetName,TableType,IsManaged,IsCustomEntity&$filter=IsIntersect eq false`;
        const entityResponse = await fetch(entityUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
                Accept: "application/json",
                Prefer: "odata.maxpagesize=500",
            },
        });

        if (!entityResponse.ok) {
            const errorText = await entityResponse.text();
            throw new Error(`Failed to fetch entity definitions: ${entityResponse.status} ${errorText.substring(0, 300)}`);
        }

        const entityData = await entityResponse.json();
        const entities = entityData.value || [];

        // Try to get record counts via RetrieveTotalRecordCount
        // This function returns counts for all entities in one call
        let recordCounts: Record<string, number> = {};
        try {
            const countUrl = `${baseUrl}/api/data/v9.2/RetrieveTotalRecordCount(EntityNames=@p)?@p=["${
                entities.slice(0, 100).map((e: any) => e.LogicalName).join('","')
            }"]`;
            const countResponse = await fetch(countUrl, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "OData-MaxVersion": "4.0",
                    "OData-Version": "4.0",
                    Accept: "application/json",
                },
            });

            if (countResponse.ok) {
                const countData = await countResponse.json();
                const entityCounts = countData.EntityRecordCountCollection || {};
                // The response has Keys and Values arrays
                if (entityCounts.Keys && entityCounts.Values) {
                    entityCounts.Keys.forEach((key: string, i: number) => {
                        recordCounts[key.toLowerCase()] = entityCounts.Values[i] || 0;
                    });
                }
            } else {
                console.warn(`[storage] RetrieveTotalRecordCount failed: ${countResponse.status}`);
            }
        } catch (e) {
            console.warn("[storage] RetrieveTotalRecordCount failed, continuing without counts:", e);
        }

        // Build table breakdown
        const tableBreakdown = entities
            .map((entity: any) => {
                const logicalName = entity.LogicalName || "";
                const displayName = entity.DisplayName?.UserLocalizedLabel?.Label || logicalName;
                const count = recordCounts[logicalName.toLowerCase()] ?? -1;

                return {
                    logicalName,
                    displayName,
                    entitySetName: entity.EntitySetName || "",
                    tableType: entity.TableType || "Standard",
                    isManaged: entity.IsManaged ?? false,
                    isCustom: entity.IsCustomEntity ?? false,
                    recordCount: count,
                };
            })
            .filter((t: any) => t.recordCount > 0)
            .sort((a: any, b: any) => b.recordCount - a.recordCount)
            .slice(0, 100); // Top 100 tables by record count

        // Update the environment storage record with the table breakdown
        const envStorageRecords = await ctx.runQuery(api.queries.getEnvironmentStorage, { tenantId: args.tenantId });
        if (envStorageRecords.length > 0) {
            // Update the first environment storage record with this tenant's table breakdown
            const firstEnv = envStorageRecords[0];
            await ctx.runMutation(api.mutations.upsertEnvironmentStorage, {
                tenantId: args.tenantId,
                environments: [{
                    envId: firstEnv.envId,
                    envName: firstEnv.envName,
                    envType: firstEnv.envType,
                    envState: firstEnv.envState,
                    dbCapacityMB: firstEnv.dbCapacityMB,
                    fileCapacityMB: firstEnv.fileCapacityMB,
                    logCapacityMB: firstEnv.logCapacityMB,
                    dbUsedMB: firstEnv.dbUsedMB,
                    fileUsedMB: firstEnv.fileUsedMB,
                    logUsedMB: firstEnv.logUsedMB,
                    tableBreakdown: JSON.stringify(tableBreakdown),
                }],
            });
        }

        return tableBreakdown;
    },
});

// Sync all storage data in one batch
export const syncAllStorage = action({
    args: {
        tenantId: v.string(),
        orgId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        console.log(`[syncAllStorage] Syncing all storage for tenant: ${args.tenantId}`);

        // First fetch environment storage from PP Admin API
        let envStorage: any[] = [];
        try {
            envStorage = await ctx.runAction(api.actions.storage.fetchEnvironmentStorage, {
                tenantId: args.tenantId,
                orgId: args.orgId,
            });
        } catch (error: any) {
            console.warn("[syncAllStorage] PP Admin API fetch failed:", error.message);
        }

        // Then fetch table breakdown from D365 OData
        let tableBreakdown: any[] = [];
        try {
            tableBreakdown = await ctx.runAction(api.actions.storage.fetchTableBreakdown, {
                tenantId: args.tenantId,
                orgId: args.orgId,
            });
        } catch (error: any) {
            console.warn("[syncAllStorage] Table breakdown fetch failed:", error.message);
        }

        return {
            environments: envStorage.length,
            tablesTracked: tableBreakdown.length,
        };
    },
});
