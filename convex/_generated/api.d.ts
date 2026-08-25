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
import type * as attendanceImport from "../attendanceImport.js";
import type * as attendanceImportParse from "../attendanceImportParse.js";
import type * as attendanceImportSheet from "../attendanceImportSheet.js";
import type * as attendanceImportValidate from "../attendanceImportValidate.js";
import type * as auth from "../auth.js";
import type * as boarding from "../boarding.js";
import type * as departments from "../departments.js";
import type * as driveUploadStages from "../driveUploadStages.js";
import type * as duties from "../duties.js";
import type * as entityCodes from "../entityCodes.js";
import type * as homeroomAlerts from "../homeroomAlerts.js";
import type * as homeroomCatalog from "../homeroomCatalog.js";
import type * as homeroomClasses from "../homeroomClasses.js";
import type * as homeroomContext from "../homeroomContext.js";
import type * as homeroomPolicy from "../homeroomPolicy.js";
import type * as homeroomReportPolicy from "../homeroomReportPolicy.js";
import type * as homeroomReports from "../homeroomReports.js";
import type * as homeroomTime from "../homeroomTime.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as locations from "../locations.js";
import type * as loginSecurity from "../loginSecurity.js";
import type * as mail from "../mail.js";
import type * as menuAccess from "../menuAccess.js";
import type * as notifications from "../notifications.js";
import type * as peopleReview from "../peopleReview.js";
import type * as permissionGroups from "../permissionGroups.js";
import type * as positions from "../positions.js";
import type * as push from "../push.js";
import type * as pushActions from "../pushActions.js";
import type * as pushPayload from "../pushPayload.js";
import type * as reports from "../reports.js";
import type * as schoolYears from "../schoolYears.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as staffFaultsPolicy from "../staffFaultsPolicy.js";
import type * as studentAttendance from "../studentAttendance.js";
import type * as studentAttendancePolicy from "../studentAttendancePolicy.js";
import type * as studentRosterImport from "../studentRosterImport.js";
import type * as studentRosterImportParse from "../studentRosterImportParse.js";
import type * as studentRosterImportSheet from "../studentRosterImportSheet.js";
import type * as studentRosterImportValidate from "../studentRosterImportValidate.js";
import type * as students from "../students.js";
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
  attendanceImport: typeof attendanceImport;
  attendanceImportParse: typeof attendanceImportParse;
  attendanceImportSheet: typeof attendanceImportSheet;
  attendanceImportValidate: typeof attendanceImportValidate;
  auth: typeof auth;
  boarding: typeof boarding;
  departments: typeof departments;
  driveUploadStages: typeof driveUploadStages;
  duties: typeof duties;
  entityCodes: typeof entityCodes;
  homeroomAlerts: typeof homeroomAlerts;
  homeroomCatalog: typeof homeroomCatalog;
  homeroomClasses: typeof homeroomClasses;
  homeroomContext: typeof homeroomContext;
  homeroomPolicy: typeof homeroomPolicy;
  homeroomReportPolicy: typeof homeroomReportPolicy;
  homeroomReports: typeof homeroomReports;
  homeroomTime: typeof homeroomTime;
  http: typeof http;
  lib: typeof lib;
  locations: typeof locations;
  loginSecurity: typeof loginSecurity;
  mail: typeof mail;
  menuAccess: typeof menuAccess;
  notifications: typeof notifications;
  peopleReview: typeof peopleReview;
  permissionGroups: typeof permissionGroups;
  positions: typeof positions;
  push: typeof push;
  pushActions: typeof pushActions;
  pushPayload: typeof pushPayload;
  reports: typeof reports;
  schoolYears: typeof schoolYears;
  seed: typeof seed;
  sessions: typeof sessions;
  settings: typeof settings;
  staffFaultsPolicy: typeof staffFaultsPolicy;
  studentAttendance: typeof studentAttendance;
  studentAttendancePolicy: typeof studentAttendancePolicy;
  studentRosterImport: typeof studentRosterImport;
  studentRosterImportParse: typeof studentRosterImportParse;
  studentRosterImportSheet: typeof studentRosterImportSheet;
  studentRosterImportValidate: typeof studentRosterImportValidate;
  students: typeof students;
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
