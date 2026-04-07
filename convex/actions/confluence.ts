"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
const { api } = require("../_generated/api") as any;

export const searchConfluencePages = action({
    args: {
        query: v.string(),
        spaceKey: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");

        const settings = await ctx.runQuery(api.queries.getConfluenceSettingsByUserId, {
            userId: identity.tokenIdentifier,
        });

        if (!settings || !settings.domain || !settings.email || !settings.apiToken) {
            throw new Error("Confluence settings incomplete. Please configure Domain, Email, and API Token first.");
        }

        const { domain, email, apiToken } = settings;
        const effectiveSpaceKey = args.spaceKey || settings.spaceKey;
        const sanitizedDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
        const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
        const limit = args.limit || 25;

        // Use CQL search for flexible title matching
        const searchQuery = args.query.trim();
        let cql: string;

        if (searchQuery) {
            // Escape special CQL characters
            const escaped = searchQuery.replace(/['"\\]/g, "\\$&");
            if (effectiveSpaceKey) {
                cql = `type=page AND space="${effectiveSpaceKey}" AND title~"${escaped}"`;
            } else {
                cql = `type=page AND title~"${escaped}"`;
            }
        } else {
            // Empty query — show recent pages
            if (effectiveSpaceKey) {
                cql = `type=page AND space="${effectiveSpaceKey}" ORDER BY lastmodified DESC`;
            } else {
                cql = `type=page ORDER BY lastmodified DESC`;
            }
        }

        const url = `https://${sanitizedDomain}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=${limit}&expand=ancestors`;

        const response = await fetch(url, {
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            const errText = await response.text();
            if (response.status === 401 || response.status === 403) {
                throw new Error("Confluence authentication failed. Please check your credentials.");
            }
            throw new Error(`Confluence search failed: ${response.status} ${errText}`);
        }

        const data = await response.json();
        const results = (data.results || []).map((page: any) => {
            const ancestors = (page.ancestors || []).map((a: any) => a.title);
            const breadcrumb = ancestors.length > 0 ? ancestors.join(" / ") : undefined;

            return {
                id: page.id,
                title: page.title,
                spaceKey: page.space?.key || effectiveSpaceKey || "",
                url: `https://${sanitizedDomain}/wiki${page._links?.webui || ""}`,
                breadcrumb,
            };
        });

        return results as {
            id: string;
            title: string;
            spaceKey: string;
            url: string;
            breadcrumb?: string;
        }[];
    },
});
