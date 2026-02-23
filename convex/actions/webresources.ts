"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { decrypt } from "../lib/crypto";
import { getD365AccessToken, resolveTenant } from "../lib/tokenHelper";
const { api } = require("../_generated/api") as any;

const WEB_RESOURCE_TYPE_LABELS: Record<number, string> = {
    1: "HTML", 2: "CSS", 3: "JScript", 4: "XML", 5: "PNG",
    6: "JPG", 7: "GIF", 8: "XAP", 9: "XSL", 10: "ICO", 11: "SVG", 12: "RESX"
};

export const listWebResources = action({
    args: { tenantId: v.string(), orgId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const tenants = await ctx.runQuery(api.queries.getTenants, { orgId: args.orgId });
        const { tenant, sanitizedUrl } = resolveTenant(tenants, args.tenantId);
        const token = await getD365AccessToken(sanitizedUrl, tenant.clientId, decrypt(tenant.clientSecret), tenant.tenantDirectoryId);

        // Fetch only custom (unmanaged) web resources to avoid pulling thousands of system resources
        const url = `https://${sanitizedUrl}/api/data/v9.2/webresourceset?$select=name,displayname,webresourcetype,description,ismanaged,modifiedon&$filter=ismanaged eq false&$orderby=name asc`;

        console.log(`[listWebResources] Fetching from: ${url}`);

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Prefer: 'odata.maxpagesize=5000'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[listWebResources] Error ${response.status}: ${errorText}`);
            throw new Error(`Failed to fetch web resources: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        const mapped = data.value.map((wr: any) => ({
            webResourceId: wr.webresourceid,
            name: wr.name,
            displayName: wr.displayname || undefined,
            webResourceType: wr.webresourcetype,
            description: wr.description || undefined,
            isManaged: wr.ismanaged ?? false,
            modifiedOn: wr.modifiedon || undefined,
        }));

        console.log(`[listWebResources] Found ${mapped.length} custom web resources`);

        // Batch upserts in chunks to avoid Convex's 4096 read limit per mutation
        const BATCH_SIZE = 100;
        for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
            const batch = mapped.slice(i, i + BATCH_SIZE);
            await ctx.runMutation(api.mutations.upsertWebResources, {
                tenantId: args.tenantId,
                webResources: batch
            });
            console.log(`[listWebResources] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(mapped.length / BATCH_SIZE)}`);
        }

        return mapped;
    },
});

export const getWebResourceContent = action({
    args: { tenantId: v.string(), webResourceId: v.string(), orgId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const tenants = await ctx.runQuery(api.queries.getTenants, { orgId: args.orgId });
        const { tenant, sanitizedUrl } = resolveTenant(tenants, args.tenantId);
        const token = await getD365AccessToken(sanitizedUrl, tenant.clientId, decrypt(tenant.clientSecret), tenant.tenantDirectoryId);

        const url = `https://${sanitizedUrl}/api/data/v9.2/webresourceset(${args.webResourceId})?$select=content,name,webresourcetype`;

        console.log(`[getWebResourceContent] Fetching from: ${url}`);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[getWebResourceContent] Error ${response.status}: ${errorText}`);
            throw new Error(`Failed to fetch web resource content: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const base64Content = data.content || "";
        const webResourceType = data.webresourcetype;

        // Decode base64 for text-based resources (HTML, CSS, JS, XML, XSL, RESX, SVG)
        const textTypes = [1, 2, 3, 4, 9, 11, 12];
        let decodedContent = "";

        if (textTypes.includes(webResourceType) && base64Content) {
            try {
                decodedContent = Buffer.from(base64Content, "base64").toString("utf-8");
            } catch (e) {
                console.error("[getWebResourceContent] Failed to decode base64:", e);
                decodedContent = "// Failed to decode content";
            }
        }

        return {
            name: data.name,
            webResourceType,
            typeLabel: WEB_RESOURCE_TYPE_LABELS[webResourceType] || `Type ${webResourceType}`,
            base64Content,
            decodedContent,
            sizeBytes: base64Content ? Math.floor(base64Content.length * 0.75) : 0,
            isTextBased: textTypes.includes(webResourceType),
        };
    },
});
