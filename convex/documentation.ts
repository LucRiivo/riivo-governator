
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// --- Mutations ---

export const saveDocumentation = mutation({
    args: {
        flowId: v.id("flows"),
        content: v.string(),
        status: v.string(), // 'draft' | 'published'
        confluencePageId: v.optional(v.string()),
        confluenceUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existingDoc = await ctx.db
            .query("flow_documentation")
            .withIndex("by_flowId", (q) => q.eq("flowId", args.flowId))
            .first();

        if (existingDoc) {
            await ctx.db.patch(existingDoc._id, {
                content: args.content,
                status: args.status,
                confluencePageId: args.confluencePageId ?? existingDoc.confluencePageId,
                confluenceUrl: args.confluenceUrl ?? existingDoc.confluenceUrl,
                lastUpdated: Date.now(),
            });
        } else {
            await ctx.db.insert("flow_documentation", {
                flowId: args.flowId,
                content: args.content,
                status: args.status,
                confluencePageId: args.confluencePageId,
                confluenceUrl: args.confluenceUrl,
                lastUpdated: Date.now(),
            });
        }
    },
});

export const saveConfluenceSettings = mutation({
    args: {
        domain: v.string(),
        email: v.string(),
        apiToken: v.string(),
        spaceKey: v.string(),
        parentId: v.optional(v.string()), // Optional parent page ID
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");

        const userId = identity.tokenIdentifier;

        const existingSettings = await ctx.db
            .query("confluence_settings")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .first();

        if (existingSettings) {
            await ctx.db.patch(existingSettings._id, {
                domain: args.domain,
                email: args.email,
                apiToken: args.apiToken,
                spaceKey: args.spaceKey,
                parentId: args.parentId,
            });
        } else {
            await ctx.db.insert("confluence_settings", {
                userId,
                domain: args.domain,
                email: args.email,
                apiToken: args.apiToken,
                spaceKey: args.spaceKey,
                parentId: args.parentId,
            });
        }
    },
});

// --- Security Documentation ---

export const saveSecurityDocumentation = mutation({
    args: {
        tenantId: v.string(),
        content: v.string(),
        status: v.string(),
        confluencePageId: v.optional(v.string()),
        confluenceUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("security_documentation")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                content: args.content,
                status: args.status,
                confluencePageId: args.confluencePageId ?? existing.confluencePageId,
                confluenceUrl: args.confluenceUrl ?? existing.confluenceUrl,
                lastUpdated: Date.now(),
            });
        } else {
            await ctx.db.insert("security_documentation", {
                tenantId: args.tenantId,
                content: args.content,
                status: args.status,
                confluencePageId: args.confluencePageId,
                confluenceUrl: args.confluenceUrl,
                lastUpdated: Date.now(),
            });
        }
    },
});

// --- App Documentation ---

export const saveAppDocumentation = mutation({
    args: {
        appId: v.id("model_driven_apps"),
        content: v.string(),
        status: v.string(),
        confluencePageId: v.optional(v.string()),
        confluenceUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("app_documentation")
            .withIndex("by_appId", (q) => q.eq("appId", args.appId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                content: args.content,
                status: args.status,
                confluencePageId: args.confluencePageId ?? existing.confluencePageId,
                confluenceUrl: args.confluenceUrl ?? existing.confluenceUrl,
                lastUpdated: Date.now(),
            });
        } else {
            await ctx.db.insert("app_documentation", {
                appId: args.appId,
                content: args.content,
                status: args.status,
                confluencePageId: args.confluencePageId,
                confluenceUrl: args.confluenceUrl,
                lastUpdated: Date.now(),
            });
        }
    },
});

// --- Web Resource Documentation ---

export const saveWebResourceDocumentation = mutation({
    args: {
        webResourceId: v.id("web_resources"),
        content: v.string(),
        status: v.string(),
        confluencePageId: v.optional(v.string()),
        confluenceUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("web_resource_documentation")
            .withIndex("by_webResourceId", (q) => q.eq("webResourceId", args.webResourceId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                content: args.content,
                status: args.status,
                confluencePageId: args.confluencePageId ?? existing.confluencePageId,
                confluenceUrl: args.confluenceUrl ?? existing.confluenceUrl,
                lastUpdated: Date.now(),
            });
        } else {
            await ctx.db.insert("web_resource_documentation", {
                webResourceId: args.webResourceId,
                content: args.content,
                status: args.status,
                confluencePageId: args.confluencePageId,
                confluenceUrl: args.confluenceUrl,
                lastUpdated: Date.now(),
            });
        }
    },
});

// --- Queries ---

export const getDocumentation = query({
    args: { flowId: v.id("flows") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("flow_documentation")
            .withIndex("by_flowId", (q) => q.eq("flowId", args.flowId))
            .first();
    },
});

export const getSecurityDocumentation = query({
    args: { tenantId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("security_documentation")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .first();
    },
});

export const getAppDocumentation = query({
    args: { appId: v.id("model_driven_apps") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("app_documentation")
            .withIndex("by_appId", (q) => q.eq("appId", args.appId))
            .first();
    },
});

export const getWebResourceDocumentation = query({
    args: { webResourceId: v.id("web_resources") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("web_resource_documentation")
            .withIndex("by_webResourceId", (q) => q.eq("webResourceId", args.webResourceId))
            .first();
    },
});

export const getConfluenceSettings = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        return await ctx.db
            .query("confluence_settings")
            .withIndex("by_userId", (q) => q.eq("userId", identity.tokenIdentifier))
            .first();
    },
});
