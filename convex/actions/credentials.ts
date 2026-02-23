"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { encrypt, isEncrypted } from "../lib/crypto";

const { api, internal } = require("../_generated/api") as any;

/**
 * Encrypts the clientSecret and stores a new tenant connection.
 * Replaces the direct mutation call from the frontend.
 */
export const addTenant = action({
    args: {
        name: v.string(),
        url: v.string(),
        clientId: v.string(),
        clientSecret: v.string(),
        tenantDirectoryId: v.optional(v.string()),
        orgId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const encryptedSecret = encrypt(args.clientSecret);

        return await ctx.runMutation(internal.mutations._addTenant, {
            name: args.name,
            url: args.url,
            clientId: args.clientId,
            clientSecret: encryptedSecret,
            tenantDirectoryId: args.tenantDirectoryId,
            orgId: args.orgId,
        });
    },
});

/**
 * Encrypts the clientSecret and stores/updates a Power Platform Admin connection.
 */
export const savePPAdminConnection = action({
    args: {
        tenantId: v.string(),
        ppTenantId: v.string(),
        clientId: v.string(),
        clientSecret: v.string(),
        displayName: v.optional(v.string()),
        orgId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const encryptedSecret = encrypt(args.clientSecret);

        return await ctx.runMutation(internal.mutations._savePPAdminConnection, {
            tenantId: args.tenantId,
            ppTenantId: args.ppTenantId,
            clientId: args.clientId,
            clientSecret: encryptedSecret,
            displayName: args.displayName,
            orgId: args.orgId,
        });
    },
});

/**
 * Encrypts the apiKey and stores/updates an Application Insights connection.
 */
export const saveAppInsightsConnection = action({
    args: {
        tenantId: v.string(),
        appInsightsAppId: v.string(),
        apiKey: v.string(),
        displayName: v.optional(v.string()),
        orgId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const encryptedKey = encrypt(args.apiKey);

        return await ctx.runMutation(internal.mutations._saveAppInsightsConnection, {
            tenantId: args.tenantId,
            appInsightsAppId: args.appInsightsAppId,
            apiKey: encryptedKey,
            displayName: args.displayName,
            orgId: args.orgId,
        });
    },
});

/**
 * One-time migration: encrypts all existing plaintext credentials in the database.
 * Safe to run multiple times -- skips already-encrypted values.
 */
export const migrateEncryptCredentials = action({
    args: {},
    handler: async (ctx) => {
        const stats = { tenants: 0, ppAdmin: 0, appInsights: 0, skipped: 0 };

        // Migrate tenants
        const tenants = await ctx.runQuery(api.queries.getTenants, {});
        for (const tenant of tenants) {
            if (!isEncrypted(tenant.clientSecret)) {
                const encrypted = encrypt(tenant.clientSecret);
                await ctx.runMutation(internal.mutations._patchTenantSecret, {
                    id: tenant._id,
                    clientSecret: encrypted,
                });
                stats.tenants++;
            } else {
                stats.skipped++;
            }
        }

        // Migrate PP Admin connections
        const ppConns = await ctx.runQuery(api.queries.getAllPPAdminConnections, {});
        for (const conn of ppConns) {
            if (!isEncrypted(conn.clientSecret)) {
                const encrypted = encrypt(conn.clientSecret);
                await ctx.runMutation(internal.mutations._patchPPAdminSecret, {
                    id: conn._id,
                    clientSecret: encrypted,
                });
                stats.ppAdmin++;
            } else {
                stats.skipped++;
            }
        }

        // Migrate App Insights connections
        const aiConns = await ctx.runQuery(api.queries.getAllAppInsightsConnections, {});
        for (const conn of aiConns) {
            if (!isEncrypted(conn.apiKey)) {
                const encrypted = encrypt(conn.apiKey);
                await ctx.runMutation(internal.mutations._patchAppInsightsKey, {
                    id: conn._id,
                    apiKey: encrypted,
                });
                stats.appInsights++;
            } else {
                stats.skipped++;
            }
        }

        console.log(`[migration] Encrypted credentials: ${JSON.stringify(stats)}`);
        return stats;
    },
});
