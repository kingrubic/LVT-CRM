/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as boarding from "../boarding.js";
import type * as departments from "../departments.js";
import type * as duties from "../duties.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as locations from "../locations.js";
import type * as permissionGroups from "../permissionGroups.js";
import type * as positions from "../positions.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";
import type * as work from "../work.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  boarding: typeof boarding;
  departments: typeof departments;
  duties: typeof duties;
  http: typeof http;
  lib: typeof lib;
  locations: typeof locations;
  permissionGroups: typeof permissionGroups;
  positions: typeof positions;
  reports: typeof reports;
  seed: typeof seed;
  users: typeof users;
  work: typeof work;
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
