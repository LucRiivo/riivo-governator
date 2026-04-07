"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { decrypt } from "../lib/crypto";
import { getD365AccessToken, resolveTenant } from "../lib/tokenHelper";
import { markdownToStorage } from "../lib/markdownToStorage";
const { api } = require("../_generated/api") as any;

// Generate ERD for a specific model-driven app
export const generateErd = action({
    args: {
        tenantId: v.string(),
        appModuleId: v.string(), // D365 app module GUID
        appName: v.string(),
        orgId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const tenants = await ctx.runQuery(api.queries.getTenants, { orgId: args.orgId });
        const { tenant, sanitizedUrl } = resolveTenant(tenants, args.tenantId);
        const token = await getD365AccessToken(sanitizedUrl, tenant.clientId, decrypt(tenant.clientSecret), tenant.tenantDirectoryId);

        // 1. Get entities that belong to this app
        // Try multiple approaches as D365 API varies by version
        let entityIds = new Set<string>();

        // Approach 1: RetrieveAppComponents function
        const retrieveUrl = `https://${sanitizedUrl}/api/data/v9.2/RetrieveAppComponents(AppModuleId=${args.appModuleId})`;
        console.log(`[generateErd] Trying RetrieveAppComponents for "${args.appName}"`);

        const retrieveResponse = await fetch(retrieveUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (retrieveResponse.ok) {
            const retrieveData = await retrieveResponse.json();
            // Response contains AppComponents array with componenttype and objectid
            const components = retrieveData.AppComponents || retrieveData.value || [];
            for (const comp of components) {
                // ComponentType 1 = Entity
                if (comp.componenttype === 1 && comp.objectid) {
                    entityIds.add(comp.objectid.toLowerCase());
                }
            }
            console.log(`[generateErd] RetrieveAppComponents returned ${entityIds.size} entities`);
        } else {
            console.log(`[generateErd] RetrieveAppComponents failed (${retrieveResponse.status}), trying appmodulecomponent...`);
        }

        // Approach 2: Query appmodulecomponent entity directly
        if (entityIds.size === 0) {
            const compUrl = `https://${sanitizedUrl}/api/data/v9.2/appmodulecomponents?$filter=_appmoduleid_value eq '${args.appModuleId}' and componenttype eq 1&$select=objectid,componenttype`;
            console.log(`[generateErd] Trying appmodulecomponents query`);

            const compResponse = await fetch(compUrl, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (compResponse.ok) {
                const compData = await compResponse.json();
                for (const c of compData.value) {
                    if (c.objectid) entityIds.add(c.objectid.toLowerCase());
                }
                console.log(`[generateErd] appmodulecomponents returned ${entityIds.size} entities`);
            } else {
                console.log(`[generateErd] appmodulecomponents failed (${compResponse.status})`);
            }
        }

        // Approach 3: Parse the app sitemap XML for entity references
        if (entityIds.size === 0) {
            console.log(`[generateErd] Trying sitemap parsing for "${args.appName}"`);
            const sitemapUrl = `https://${sanitizedUrl}/api/data/v9.2/appmodules(${args.appModuleId})?$select=sitemapxml`;
            const sitemapResponse = await fetch(sitemapUrl, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (sitemapResponse.ok) {
                const sitemapData = await sitemapResponse.json();
                const sitemapXml: string = sitemapData.sitemapxml || '';

                if (sitemapXml) {
                    // Extract Entity="xxx" from sitemap XML SubArea elements
                    const entityMatches = sitemapXml.matchAll(/Entity="([^"]+)"/gi);
                    const sitemapEntities = new Set<string>();
                    for (const match of entityMatches) {
                        sitemapEntities.add(match[1].toLowerCase());
                    }

                    if (sitemapEntities.size > 0) {
                        console.log(`[generateErd] Found ${sitemapEntities.size} entities from sitemap`);

                        // We need to get MetadataIds for these logical names
                        const allEntitiesUrl = `https://${sanitizedUrl}/api/data/v9.2/EntityDefinitions?$select=LogicalName,MetadataId`;
                        const allEntitiesRes = await fetch(allEntitiesUrl, {
                            headers: { Authorization: `Bearer ${token}` }
                        });

                        if (allEntitiesRes.ok) {
                            const allEntitiesData = await allEntitiesRes.json();
                            for (const e of allEntitiesData.value) {
                                if (sitemapEntities.has(e.LogicalName.toLowerCase())) {
                                    entityIds.add(e.MetadataId.toLowerCase());
                                }
                            }
                        }
                        console.log(`[generateErd] Resolved ${entityIds.size} entities from sitemap`);
                    }
                }
            } else {
                console.log(`[generateErd] Sitemap fetch failed (${sitemapResponse.status})`);
            }
        }

        if (entityIds.size === 0) {
            throw new Error(`No table components found in app "${args.appName}". The app may not have any entities configured.`);
        }

        // 2. Get EntityDefinitions to map MetadataId -> LogicalName and DisplayName
        const entitiesUrl = `https://${sanitizedUrl}/api/data/v9.2/EntityDefinitions?$select=LogicalName,DisplayName,MetadataId`;
        const entitiesResponse = await fetch(entitiesUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!entitiesResponse.ok) {
            throw new Error(`Failed to fetch entity definitions: ${entitiesResponse.status}`);
        }

        const entitiesData = await entitiesResponse.json();

        const appEntities: { logicalName: string; displayName: string }[] = [];
        const appLogicalNames = new Set<string>();

        for (const entity of entitiesData.value) {
            if (entityIds.has(entity.MetadataId.toLowerCase())) {
                const displayName = entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName;
                appEntities.push({ logicalName: entity.LogicalName, displayName });
                appLogicalNames.add(entity.LogicalName);
            }
        }

        console.log(`[generateErd] Matched ${appEntities.length} entities for app "${args.appName}"`);

        if (appEntities.length === 0) {
            throw new Error(`Could not resolve any entities for app "${args.appName}".`);
        }

        // 3. Fetch relationships (One-to-Many and Many-to-Many) between app entities
        const relationships: { from: string; to: string; type: string }[] = [];

        // Fetch both relationship types in parallel
        const [otmResponse, mtmResponse] = await Promise.all([
            fetch(`https://${sanitizedUrl}/api/data/v9.2/RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?$select=SchemaName,ReferencedEntity,ReferencingEntity`, {
                headers: { Authorization: `Bearer ${token}` }
            }),
            fetch(`https://${sanitizedUrl}/api/data/v9.2/RelationshipDefinitions/Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata?$select=SchemaName,Entity1LogicalName,Entity2LogicalName`, {
                headers: { Authorization: `Bearer ${token}` }
            }),
        ]);

        if (otmResponse.ok) {
            const otmData = await otmResponse.json();
            for (const rel of otmData.value) {
                if (rel.ReferencedEntity !== rel.ReferencingEntity &&
                    appLogicalNames.has(rel.ReferencedEntity) &&
                    appLogicalNames.has(rel.ReferencingEntity)) {
                    relationships.push({
                        from: rel.ReferencedEntity,
                        to: rel.ReferencingEntity,
                        type: '1-to-many',
                    });
                }
            }
        }

        if (mtmResponse.ok) {
            const mtmData = await mtmResponse.json();
            for (const rel of mtmData.value) {
                if (appLogicalNames.has(rel.Entity1LogicalName) &&
                    appLogicalNames.has(rel.Entity2LogicalName)) {
                    relationships.push({
                        from: rel.Entity1LogicalName,
                        to: rel.Entity2LogicalName,
                        type: 'many-to-many',
                    });
                }
            }
        }

        console.log(`[generateErd] Found ${relationships.length} relationships between app tables`);

        // 4. Deduplicate
        const seen = new Set<string>();
        const uniqueRelationships = relationships.filter(rel => {
            const key = `${rel.from}|${rel.to}|${rel.type}`;
            const reverseKey = `${rel.to}|${rel.from}|${rel.type}`;
            if (seen.has(key) || seen.has(reverseKey)) return false;
            seen.add(key);
            return true;
        });

        // 5. Build Mermaid ERD
        const displayNameMap = new Map<string, string>();
        for (const e of appEntities) {
            displayNameMap.set(e.logicalName, e.displayName);
        }

        let mermaid = 'erDiagram\n';

        for (const entity of appEntities) {
            const safeName = sanitizeMermaidName(entity.displayName);
            mermaid += `    ${safeName} {\n    }\n`;
        }

        for (const rel of uniqueRelationships) {
            const fromName = sanitizeMermaidName(displayNameMap.get(rel.from) || rel.from);
            const toName = sanitizeMermaidName(displayNameMap.get(rel.to) || rel.to);

            if (rel.type === '1-to-many') {
                mermaid += `    ${fromName} ||--o{ ${toName} : ""\n`;
            } else {
                mermaid += `    ${fromName} }o--o{ ${toName} : ""\n`;
            }
        }

        // 6. Save to DB
        await ctx.runMutation(api.mutations.saveErdDiagram, {
            tenantId: args.tenantId,
            appModuleId: args.appModuleId,
            mermaidCode: mermaid,
            status: 'draft',
        });

        return mermaid;
    },
});

// Publish ERD to Confluence
export const publishErdToConfluence = action({
    args: {
        tenantId: v.string(),
        appModuleId: v.string(),
        appName: v.string(),
        mermaidCode: v.string(),
        parentPageId: v.optional(v.string()), // Override parent page from settings
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");

        const settings = await ctx.runQuery(api.queries.getConfluenceSettingsByUserId, { userId: identity.tokenIdentifier });

        if (!settings || !settings.spaceKey) {
            throw new Error("Confluence settings incomplete. Please configure in the Documentation tab first.");
        }

        const { domain, email, apiToken, spaceKey, parentId } = settings;
        const sanitizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
        const baseUrl = `https://${sanitizedDomain}/wiki/api/v2`;

        const spaceRes = await fetch(`${baseUrl}/spaces?keys=${spaceKey}`, {
            headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
        });

        if (!spaceRes.ok) {
            throw new Error(`Failed to fetch Space ID for key '${spaceKey}': ${spaceRes.status}`);
        }
        const spaceData = await spaceRes.json();
        if (spaceData.results.length === 0) {
            throw new Error(`Space with key '${spaceKey}' not found.`);
        }
        const spaceId = spaceData.results[0].id;

        const markdownContent = `## Entity Relationship Diagram - ${args.appName}\n\nThis ERD shows the relationships between Dataverse tables used in the **${args.appName}** model-driven app.\n\n\`\`\`mermaid\n${args.mermaidCode}\`\`\`\n\n*Published via Governator*`;
        const storageBody = markdownToStorage(markdownContent);

        const title = `ERD - ${args.appName}`;

        const erdDoc = await ctx.runQuery(api.queries.getErdDiagram, { tenantId: args.tenantId, appModuleId: args.appModuleId });
        const existingPageId = erdDoc?.confluencePageId;

        let pageId = existingPageId;
        let finalUrl = "";

        if (existingPageId) {
            const pageRes = await fetch(`${baseUrl}/pages/${existingPageId}`, {
                headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
            });

            if (pageRes.ok) {
                const pageData = await pageRes.json();
                const newVersion = pageData.version.number + 1;

                const response = await fetch(`${baseUrl}/pages/${existingPageId}`, {
                    method: 'PUT',
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({
                        id: existingPageId, status: 'current', title,
                        body: { representation: 'storage', value: storageBody },
                        version: { number: newVersion, message: "ERD updated via Governator" }
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Failed to update page: ${response.status} ${errText}`);
                }

                const resultData = await response.json();
                finalUrl = `https://${sanitizedDomain}/wiki${resultData._links.webui}`;
            } else {
                throw new Error(`Failed to fetch existing page ${existingPageId}.`);
            }
        } else {
            const createBody: any = {
                spaceId, status: 'current', title,
                body: { representation: 'storage', value: storageBody },
            };
            const effectiveParentId = args.parentPageId || parentId;
            if (effectiveParentId) createBody.parentId = effectiveParentId;

            const response = await fetch(`${baseUrl}/pages`, {
                method: 'POST',
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(createBody)
            });

            if (!response.ok) {
                const errText = await response.text();
                if (response.status === 404 || errText.toLowerCase().includes("parent")) {
                    throw new Error(`The selected parent page may no longer exist or you don't have access. Please choose a different page. (${response.status})`);
                }
                throw new Error(`Confluence API Error: ${response.status} ${errText}`);
            }

            const resultData = await response.json();
            pageId = resultData.id;
            finalUrl = `https://${sanitizedDomain}/wiki${resultData._links.webui}`;
        }

        if (pageId) {
            await ctx.runMutation(api.mutations.saveErdDiagram, {
                tenantId: args.tenantId,
                appModuleId: args.appModuleId,
                mermaidCode: args.mermaidCode,
                status: 'published',
                confluencePageId: pageId,
                confluenceUrl: finalUrl,
            });
        }

        return { success: true, url: finalUrl };
    },
});

function sanitizeMermaidName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}
