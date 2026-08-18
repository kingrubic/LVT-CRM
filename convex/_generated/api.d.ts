/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assignmentPolicy from "../assignmentPolicy.js";
import type * as auth from "../auth.js";
import type * as boarding from "../boarding.js";
import type * as departments from "../departments.js";
import type * as driveUploadStages from "../driveUploadStages.js";
import type * as duties from "../duties.js";
import type * as entityCodes from "../entityCodes.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as locations from "../locations.js";
import type * as loginSecurity from "../loginSecurity.js";
import type * as mail from "../mail.js";
import type * as notifications from "../notifications.js";
import type * as peopleReview from "../peopleReview.js";
import type * as permissionGroups from "../permissionGroups.js";
import type * as positions from "../positions.js";
import type * as push from "../push.js";
import type * as pushActions from "../pushActions.js";
import type * as pushPayload from "../pushPayload.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as userImport from "../userImport.js";
import type * as userImportParse from "../userImportParse.js";
import type * as userImportPolicy from "../userImportPolicy.js";
import type * as userImportSheet from "../userImportSheet.js";
import type * as userImportValidate from "../userImportValidate.js";
import type * as users from "../users.js";
import type * as work from "../work.js";
import type * as workDocumentPolicy from "../workDocumentPolicy.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assignmentPolicy: typeof assignmentPolicy;
  auth: typeof auth;
  boarding: typeof boarding;
  departments: typeof departments;
  driveUploadStages: typeof driveUploadStages;
  duties: typeof duties;
  entityCodes: typeof entityCodes;
  http: typeof http;
  lib: typeof lib;
  locations: typeof locations;
  loginSecurity: typeof loginSecurity;
  mail: typeof mail;
  notifications: typeof notifications;
  peopleReview: typeof peopleReview;
  permissionGroups: typeof permissionGroups;
  positions: typeof positions;
  push: typeof push;
  pushActions: typeof pushActions;
  pushPayload: typeof pushPayload;
  reports: typeof reports;
  seed: typeof seed;
  sessions: typeof sessions;
  settings: typeof settings;
  userImport: typeof userImport;
  userImportParse: typeof userImportParse;
  userImportPolicy: typeof userImportPolicy;
  userImportSheet: typeof userImportSheet;
  userImportValidate: typeof userImportValidate;
  users: typeof users;
  work: typeof work;
  workDocumentPolicy: typeof workDocumentPolicy;
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
