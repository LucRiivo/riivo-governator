"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { decrypt } from "./lib/crypto";
import { getD365AccessToken, resolveTenant } from "./lib/tokenHelper";
const { api } = require("./_generated/api") as any;

export const listFlows = action({
    args: { tenantId: v.string(), orgId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const tenants = await ctx.runQuery(api.queries.getTenants, { orgId: args.orgId });
        const { tenant, sanitizedUrl } = resolveTenant(tenants, args.tenantId);
        const token = await getD365AccessToken(sanitizedUrl, tenant.clientId, decrypt(tenant.clientSecret), tenant.tenantDirectoryId);

        const url = `https://${sanitizedUrl}/api/data/v9.2/workflows?$filter=category eq 5&$select=name,statecode,workflowid,description`;

        console.log(`[listFlows] Fetching from: ${url}`);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[listFlows] Error ${response.status}: ${errorText}`);
            throw new Error(`Failed to fetch flows: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        const mappedFlows = data.value.map((flow: any) => ({
            workflowId: flow.workflowid,
            name: flow.name,
            type: "Cloud Flow", // Hardcoded as per filter category eq 5
            status: flow.statecode === 1 ? "Active" : "Off",
            logic: {
                trigger: "Unknown", // Removed clientData so we don't know trigger yet
                steps: 0 // Removed clientData so we don't know steps yet
            },
            connRefs: 0, // Placeholder
            // clientData removed to prevent large document warning
        }));

        // Cache the flows
        await ctx.runMutation(api.mutations.upsertFlows, {
            tenantId: args.tenantId,
            flows: mappedFlows
        });

        return mappedFlows.map((f: any) => ({
            ...f,
            _id: f.workflowId
        }));
    },
});

export const getFlowDefinition = action({
    args: { tenantId: v.string(), flowId: v.string(), orgId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const tenants = await ctx.runQuery(api.queries.getTenants, { orgId: args.orgId });
        const { tenant, sanitizedUrl } = resolveTenant(tenants, args.tenantId);
        const token = await getD365AccessToken(sanitizedUrl, tenant.clientId, decrypt(tenant.clientSecret), tenant.tenantDirectoryId);

        const url = `https://${sanitizedUrl}/api/data/v9.2/workflows(${args.flowId})?$select=clientdata,name`;

        console.log(`[getFlowDefinition] Fetching from: ${url}`);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[getFlowDefinition] Error ${response.status}: ${errorText}`);
            throw new Error(`Failed to fetch definition: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        // Log keys to see if multiple fields are returned causing issues
        console.log(`[getFlowDefinition] Keys returned: ${Object.keys(data).join(", ")}`);

        return {
            name: data.name,
            clientDataJSON: data.clientdata || "{}"
        };
    }
});

export const listTables = action({
    args: { tenantId: v.string(), orgId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const tenants = await ctx.runQuery(api.queries.getTenants, { orgId: args.orgId });
        const { tenant, sanitizedUrl } = resolveTenant(tenants, args.tenantId);
        const token = await getD365AccessToken(sanitizedUrl, tenant.clientId, decrypt(tenant.clientSecret), tenant.tenantDirectoryId);

        // Fetch EntityDefinitions (tables) from Dynamics
        const url = `https://${sanitizedUrl}/api/data/v9.2/EntityDefinitions?$select=LogicalName,DisplayName,EntitySetName,Description&$filter=IsCustomizable/Value eq true`;

        console.log(`[listTables] Fetching from: ${url}`);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[listTables] Error ${response.status}: ${errorText}`);
            throw new Error(`Failed to fetch tables: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        const mappedTables = data.value.map((entity: any) => ({
            logicalName: entity.LogicalName,
            name: entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName,
            entitySetName: entity.EntitySetName || entity.LogicalName,
            description: entity.Description?.UserLocalizedLabel?.Label || undefined,
            columns: 0, // Will be populated when schema is fetched
        }));

        // Cache the tables
        await ctx.runMutation(api.mutations.upsertTables, {
            tenantId: args.tenantId,
            tables: mappedTables
        });

        return mappedTables.map((t: any) => ({
            ...t,
            _id: t.logicalName
        }));
    },
});

export const getTableSchema = action({
    args: { tenantId: v.string(), logicalName: v.string(), orgId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const tenants = await ctx.runQuery(api.queries.getTenants, { orgId: args.orgId });
        const { tenant, sanitizedUrl } = resolveTenant(tenants, args.tenantId);
        const token = await getD365AccessToken(sanitizedUrl, tenant.clientId, decrypt(tenant.clientSecret), tenant.tenantDirectoryId);

        // Fetch Attributes for the specific entity (MaxLength not available on base AttributeMetadata)
        const url = `https://${sanitizedUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${args.logicalName}')/Attributes?$select=LogicalName,DisplayName,AttributeType,RequiredLevel,Description`;

        console.log(`[getTableSchema] Fetching from: ${url}`);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[getTableSchema] Error ${response.status}: ${errorText}`);
            throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        const columns = data.value.map((attr: any) => ({
            logicalName: attr.LogicalName,
            displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.LogicalName,
            attributeType: attr.AttributeType,
            requiredLevel: attr.RequiredLevel?.Value || 'None',
            description: attr.Description?.UserLocalizedLabel?.Label || undefined,
        }));

        return {
            logicalName: args.logicalName,
            columns: columns,
            columnCount: columns.length
        };
    }
});
