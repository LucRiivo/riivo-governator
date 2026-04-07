/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as actions_appLandscapeAudit from "../actions/appLandscapeAudit.js";
import type * as actions_apps from "../actions/apps.js";
import type * as actions_confluence from "../actions/confluence.js";
import type * as actions_credentials from "../actions/credentials.js";
import type * as actions_documentation from "../actions/documentation.js";
import type * as actions_entityDocumentation from "../actions/entityDocumentation.js";
import type * as actions_erd from "../actions/erd.js";
import type * as actions_security from "../actions/security.js";
import type * as actions_securityAudit from "../actions/securityAudit.js";
import type * as actions_storage from "../actions/storage.js";
import type * as actions_storageAudit from "../actions/storageAudit.js";
import type * as actions_telemetry from "../actions/telemetry.js";
import type * as actions_webResourceAudit from "../actions/webResourceAudit.js";
import type * as actions_webresources from "../actions/webresources.js";
import type * as documentation from "../documentation.js";
import type * as gemini from "../gemini.js";
import type * as lib_claude from "../lib/claude.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_markdownToStorage from "../lib/markdownToStorage.js";
import type * as lib_tokenHelper from "../lib/tokenHelper.js";
import type * as mutations from "../mutations.js";
import type * as queries from "../queries.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  "actions/appLandscapeAudit": typeof actions_appLandscapeAudit;
  "actions/apps": typeof actions_apps;
  "actions/confluence": typeof actions_confluence;
  "actions/credentials": typeof actions_credentials;
  "actions/documentation": typeof actions_documentation;
  "actions/entityDocumentation": typeof actions_entityDocumentation;
  "actions/erd": typeof actions_erd;
  "actions/security": typeof actions_security;
  "actions/securityAudit": typeof actions_securityAudit;
  "actions/storage": typeof actions_storage;
  "actions/storageAudit": typeof actions_storageAudit;
  "actions/telemetry": typeof actions_telemetry;
  "actions/webResourceAudit": typeof actions_webResourceAudit;
  "actions/webresources": typeof actions_webresources;
  documentation: typeof documentation;
  gemini: typeof gemini;
  "lib/claude": typeof lib_claude;
  "lib/crypto": typeof lib_crypto;
  "lib/markdownToStorage": typeof lib_markdownToStorage;
  "lib/tokenHelper": typeof lib_tokenHelper;
  mutations: typeof mutations;
  queries: typeof queries;
  seed: typeof seed;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
