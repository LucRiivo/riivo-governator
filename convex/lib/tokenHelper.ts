"use node";

/**
 * Centralized token acquisition and tenant resolution helpers.
 * Replaces duplicated getAccessToken/resolveTenant across 6+ action files.
 */

export interface PPAdminConnection {
    ppTenantId: string;
    clientId: string;
    clientSecret: string;
    tenantId: string;
}

/**
 * Acquires an OAuth 2.0 access token for the D365 OData API
 * using the client_credentials grant.
 */
export async function getD365AccessToken(
    resource: string,
    clientId: string,
    clientSecret: string,
    tenantDirectoryId?: string
): Promise<string> {
    const authorityHostUrl = "https://login.microsoftonline.com";
    const tenant = tenantDirectoryId || "common";
    const authorityUrl = `${authorityHostUrl}/${tenant}/oauth2/v2.0/token`;

    const body = new URLSearchParams();
    body.append("scope", `https://${resource}/.default`);
    body.append("client_id", clientId);
    body.append("client_secret", clientSecret);
    body.append("grant_type", "client_credentials");

    const response = await fetch(authorityUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`D365 token error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error_description);
    return data.access_token;
}

/**
 * Acquires an OAuth 2.0 access token for the Power Platform Admin API
 * using the client_credentials grant.
 */
export async function getPPAdminToken(connection: PPAdminConnection): Promise<string> {
    const tokenUrl = `https://login.microsoftonline.com/${connection.ppTenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: connection.clientId,
        client_secret: connection.clientSecret,
        scope: "https://api.bap.microsoft.com/.default",
    });

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[tokenHelper] PP Admin token error ${response.status}: ${errorText}`);
        throw new Error(`Failed to acquire Power Platform Admin token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
}

/**
 * Finds a tenant by tenantId in the tenants array and sanitizes the URL.
 * Throws if tenant is not found.
 */
export function resolveTenant(tenants: any[], tenantId: string) {
    const tenant = tenants.find((t: any) => t.tenantId === tenantId);
    if (!tenant) throw new Error("Tenant not found");
    const sanitizedUrl = tenant.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return { tenant, sanitizedUrl };
}
