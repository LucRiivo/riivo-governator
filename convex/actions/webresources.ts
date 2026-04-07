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

        const headers = {
            Authorization: `Bearer ${token}`,
            Prefer: 'odata.maxpagesize=5000'
        };

        // Step 1: Find the "1. Web Resources" solution by unique name
        const solutionUrl = `https://${sanitizedUrl}/api/data/v9.2/solutions?$select=solutionid&$filter=uniquename eq '1WebResources' or friendlyname eq '1. Web Resources'&$top=1`;
        console.log(`[listWebResources] Looking up solution: ${solutionUrl}`);

        const solutionResponse = await fetch(solutionUrl, { headers });
        if (!solutionResponse.ok) {
            const errorText = await solutionResponse.text();
            console.error(`[listWebResources] Solution lookup error ${solutionResponse.status}: ${errorText}`);
            throw new Error(`Failed to look up solution: ${solutionResponse.status}`);
        }

        const solutionData = await solutionResponse.json();
        if (!solutionData.value || solutionData.value.length === 0) {
            throw new Error(`Solution "1. Web Resources" not found in this environment`);
        }

        const solutionId = solutionData.value[0].solutionid;
        console.log(`[listWebResources] Found solution ID: ${solutionId}`);

        // Step 2: Get all web resource component IDs from that solution
        // Component type 61 = Web Resources in D365
        const componentsUrl = `https://${sanitizedUrl}/api/data/v9.2/solutioncomponents?$select=objectid&$filter=_solutionid_value eq '${solutionId}' and componenttype eq 61`;
        console.log(`[listWebResources] Fetching solution components: ${componentsUrl}`);

        const componentsResponse = await fetch(componentsUrl, { headers });
        if (!componentsResponse.ok) {
            const errorText = await componentsResponse.text();
            console.error(`[listWebResources] Components lookup error ${componentsResponse.status}: ${errorText}`);
            throw new Error(`Failed to fetch solution components: ${componentsResponse.status}`);
        }

        const componentsData = await componentsResponse.json();
        const webResourceIds: string[] = componentsData.value.map((c: any) => c.objectid);
        console.log(`[listWebResources] Found ${webResourceIds.length} web resources in solution`);

        if (webResourceIds.length === 0) {
            return [];
        }

        // Step 3: Fetch the actual web resource details in batches using OData "in" filter
        const allWebResources: any[] = [];
        const FETCH_BATCH_SIZE = 50;

        for (let i = 0; i < webResourceIds.length; i += FETCH_BATCH_SIZE) {
            const batch = webResourceIds.slice(i, i + FETCH_BATCH_SIZE);
            const idFilter = batch.map(id => `webresourceid eq ${id}`).join(' or ');
            const url = `https://${sanitizedUrl}/api/data/v9.2/webresourceset?$select=name,displayname,webresourcetype,description,ismanaged,modifiedon&$filter=${idFilter}&$orderby=name asc`;

            const response = await fetch(url, { headers });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[listWebResources] Error ${response.status}: ${errorText}`);
                throw new Error(`Failed to fetch web resources: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            allWebResources.push(...data.value);
        }

        // Exclude web resources with known system/managed prefixes
        const EXCLUDED_PREFIXES = ['msdyncrm_', 'strings/', 'strings_', 'AppCommon/', 'SLAManagement/', 'msa_resources', 'systemuser', 'msdyn_', 'CRM', 'adx_identity', 'Localization', 'Activities', 'msft', 'mspcat_', 'mspp_app', 'SLAKPI'];
        const filtered = allWebResources.filter((wr: any) =>
            !EXCLUDED_PREFIXES.some(prefix => wr.name?.startsWith(prefix))
        );

        console.log(`[listWebResources] Excluded ${allWebResources.length - filtered.length} system web resources by prefix`);

        const mapped = filtered.map((wr: any) => ({
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
