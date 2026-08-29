import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  isActiveAssignmentCandidate,
  toAssignmentCandidate,
  toSafeAssignmentUser,
} from '../convex/homeroomCatalog.ts';
import {
  ASSIGNMENT_REPLACE_WARNING,
  BACK_TO_OVERVIEW,
  CLASS_CATALOG_TITLE,
  CURRENT_ASSIGNMENT_TITLE,
  DOWNLOAD_ATTENDANCE_TEMPLATE_ACTION,
  FIRST_CLASS_CTA,
  HISTORICAL_ASSIGNMENT_TITLE,
  IMPORT_ATTENDANCE_ACTION,
  OPEN_CLASS_ACTION,
  TEACHER_OVERVIEW_TITLE,
  UPCOMING_ASSIGNMENT_TITLE,
  assignmentDateRange,
  assignmentTypeLabel,
  buildClassArchivePayload,
  buildClassAssignmentPayload,
  buildClassCreatePayload,
  buildClassUpdatePayload,
  classStatusLabel,
  filterActiveClasses,
  groupAssignmentsByEffect,
  isCurrentAssignment,
  isEndedAssignment,
  isUpcomingAssignment,
  userRoleLabel,
} from '../src/homeroom/classCatalog.js';

const routerSource = readFileSync(new URL('../src/homeroom/HomeroomRouter.jsx', import.meta.url), 'utf8');
const catalogUiSource = readFileSync(new URL('../src/homeroom/HomeroomClassCatalog.jsx', import.meta.url), 'utf8');
const catalogHelperSource = readFileSync(new URL('../src/homeroom/classCatalog.js', import.meta.url), 'utf8');
const classesSource = readFileSync(new URL('../convex/homeroomClasses.ts', import.meta.url), 'utf8');
const usersSource = readFileSync(new URL('../convex/users.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/homeroom/homeroom.css', import.meta.url), 'utf8');
const reportsSource = readFileSync(new URL('../convex/homeroomReports.ts', import.meta.url), 'utf8');
const contextSource = readFileSync(new URL('../convex/homeroomContext.ts', import.meta.url), 'utf8');

test('catalog and assignment controls are manager-only and ordinary users never see them', () => {
  assert.match(catalogUiSource, /Tạo lớp đầu tiên/);
  assert.match(catalogUiSource, /Quản lý lớp/);
  assert.match(routerSource, /ClassCatalogPanel/);
  assert.match(routerSource, /ClassManagePanel/);
  assert.match(routerSource, /manageClasses:\s*true/);
  assert.match(catalogUiSource, /session\?\.isOperationalManager/);
  assert.match(catalogUiSource, /canManage/);
  assert.doesNotMatch(catalogUiSource, /menuAccess\?\.homeroom === ['"]supervisor['"]/);
  assert.doesNotMatch(catalogUiSource, /menuAccess\?\.homeroom === ['"]view['"]/);
  const catalogCall = routerSource.slice(
    routerSource.indexOf('<ClassCatalogPanel'),
    routerSource.indexOf('<ClassCatalogPanel') + 280,
  );
  assert.match(catalogCall, /session=/);
  const manageCall = routerSource.slice(
    routerSource.indexOf('<ClassManagePanel'),
    routerSource.indexOf('<ClassManagePanel') + 280,
  );
  assert.match(manageCall, /isOperationalManager/);
  const overview = routerSource.slice(
    routerSource.indexOf('function HomeroomOverview'),
    routerSource.indexOf('function AttendanceImportClassPicker'),
  );
  assert.match(overview, /TEACHER_OVERVIEW_TITLE/);
  assert.doesNotMatch(overview, /ClassCatalogPanel/);
  assert.equal(FIRST_CLASS_CTA, 'Tạo lớp đầu tiên');
  assert.equal(CLASS_CATALOG_TITLE, 'Quản lý lớp');
  assert.equal(TEACHER_OVERVIEW_TITLE, 'Lớp đang chủ nhiệm');
  assert.equal(IMPORT_ATTENDANCE_ACTION, 'Import file điểm danh');
  assert.equal(DOWNLOAD_ATTENDANCE_TEMPLATE_ACTION, 'Tải file điểm danh mẫu');
});

test('create, update, archive, and assignment payloads match existing Convex contracts', () => {
  assert.deepEqual(
    buildClassCreatePayload({
      schoolYearId: 'year-1',
      code: ' 6a1 ',
      name: ' Lớp 6A1 ',
      gradeLevel: '6',
      notes: '  Ghi chú  ',
    }),
    {
      schoolYearId: 'year-1',
      code: '6a1',
      name: 'Lớp 6A1',
      gradeLevel: 6,
      notes: 'Ghi chú',
    },
  );
  assert.deepEqual(
    buildClassCreatePayload({
      schoolYearId: 'year-1',
      code: '6A1',
      name: 'Lớp 6A1',
      gradeLevel: 7,
      notes: '   ',
    }),
    {
      schoolYearId: 'year-1',
      code: '6A1',
      name: 'Lớp 6A1',
      gradeLevel: 7,
    },
  );
  assert.deepEqual(
    buildClassUpdatePayload({
      id: 'class-1',
      code: '6A2',
      name: 'Lớp 6A2',
      gradeLevel: 6,
    }),
    {
      id: 'class-1',
      code: '6A2',
      name: 'Lớp 6A2',
      gradeLevel: 6,
    },
  );
  assert.deepEqual(buildClassArchivePayload('class-1'), { id: 'class-1' });
  assert.deepEqual(
    buildClassAssignmentPayload({
      classId: 'class-1',
      userId: 'user-1',
      assignmentType: 'homeroom_teacher',
      effectiveFrom: '2026-08-15',
    }),
    {
      classId: 'class-1',
      userId: 'user-1',
      assignmentType: 'homeroom_teacher',
      scopeKind: 'class',
      effectiveFrom: '2026-08-15',
    },
  );
  assert.throws(
    () =>
      buildClassAssignmentPayload({
        classId: 'class-1',
        userId: 'user-2',
        assignmentType: 'supervisor',
        effectiveFrom: '2026-09-01',
      }),
    /INVALID_ASSIGNMENT_TYPE/,
  );
  assert.match(catalogUiSource, /buildClassCreatePayload/);
  assert.match(catalogUiSource, /buildClassUpdatePayload/);
  assert.match(catalogUiSource, /buildClassArchivePayload/);
  assert.match(catalogUiSource, /buildClassAssignmentPayload/);
  assert.match(catalogUiSource, /gradeLevel/);
  assert.match(catalogUiSource, /option value="6"/);
  assert.match(catalogUiSource, /option value="9"/);
});

test('assignment UI is class-scope only and warns that a new GVCN closes the old row the day before', () => {
  assert.equal(
    ASSIGNMENT_REPLACE_WARNING,
    'Gán giáo viên chủ nhiệm mới sẽ đóng phân công cũ vào ngày liền trước ngày hiệu lực.',
  );
  assert.match(catalogUiSource, /ASSIGNMENT_REPLACE_WARNING/);
  assert.match(catalogHelperSource, /ngày liền trước ngày hiệu lực/);
  assert.doesNotMatch(catalogUiSource, /whole_school/);
  assert.doesNotMatch(catalogHelperSource, /whole_school/);
  assert.match(catalogHelperSource, /scopeKind:\s*['"]class['"]/);
  assert.doesNotMatch(catalogUiSource, /option value="supervisor"/);
  assert.match(catalogUiSource, /Phân công giáo viên chủ nhiệm/);
  assert.equal(assignmentTypeLabel('homeroom_teacher'), 'Giáo viên chủ nhiệm');
  assert.equal(assignmentTypeLabel('supervisor'), 'Giám thị');
  assert.equal(userRoleLabel('admin'), 'Administrator');
  assert.equal(userRoleLabel('moderator'), 'Moderator');
  assert.equal(userRoleLabel('user'), 'Người dùng');
  assert.equal(classStatusLabel('active'), 'Đang hoạt động');
  assert.equal(classStatusLabel('archived'), 'Đã lưu trữ');
  assert.equal(assignmentDateRange({ effectiveFrom: '2026-08-01' }), '2026-08-01 – hiện tại');
  assert.equal(
    assignmentDateRange({ effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' }),
    '2026-08-01 – 2026-08-31',
  );
});

test('isCurrentAssignment is date-effective both directions and future rows are upcoming not history', () => {
  const today = '2026-09-01';
  assert.equal(isCurrentAssignment({ effectiveFrom: '2026-08-01' }, today), true);
  assert.equal(isCurrentAssignment({ effectiveFrom: '2026-09-01' }, today), true);
  assert.equal(
    isCurrentAssignment({ effectiveFrom: '2026-08-01', effectiveTo: '2026-09-01' }, today),
    true,
  );
  assert.equal(
    isCurrentAssignment({ effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' }, today),
    false,
  );
  assert.equal(isCurrentAssignment({ effectiveFrom: '2026-10-01' }, today), false);
  assert.equal(isUpcomingAssignment({ effectiveFrom: '2026-10-01' }, today), true);
  assert.equal(isUpcomingAssignment({ effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' }, today), false);
  assert.equal(isEndedAssignment({ effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' }, today), true);
  assert.equal(isEndedAssignment({ effectiveFrom: '2026-10-01' }, today), false);
  const grouped = groupAssignmentsByEffect(
    [
      { _id: 'current', effectiveFrom: '2026-08-01' },
      { _id: 'upcoming', effectiveFrom: '2026-10-01' },
      { _id: 'ended', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' },
    ],
    today,
  );
  assert.deepEqual(grouped.current.map((row) => row._id), ['current']);
  assert.deepEqual(grouped.upcoming.map((row) => row._id), ['upcoming']);
  assert.deepEqual(grouped.historical.map((row) => row._id), ['ended']);
  assert.equal(CURRENT_ASSIGNMENT_TITLE, 'Phân công hiện tại');
  assert.equal(UPCOMING_ASSIGNMENT_TITLE, 'Sắp hiệu lực');
  assert.equal(HISTORICAL_ASSIGNMENT_TITLE, 'Lịch sử phân công');
  assert.match(catalogUiSource, /UPCOMING_ASSIGNMENT_TITLE/);
  assert.match(catalogUiSource, /groupAssignmentsByEffect/);
  assert.doesNotMatch(
    catalogUiSource.slice(
      catalogUiSource.indexOf('function AssignmentList'),
      catalogUiSource.indexOf('export function ClassManagePanel'),
    ),
    /!isCurrentAssignment/,
  );
});

test('class cards expose code, name, grade, status, roster count, and a single open action', () => {
  const cards = catalogUiSource.slice(
    catalogUiSource.indexOf('export function ClassCards'),
    catalogUiSource.indexOf('function AssignmentGroup'),
  );
  assert.match(catalogUiSource, /item\.code/);
  assert.match(catalogUiSource, /item\.name/);
  assert.match(catalogUiSource, /item\.gradeLevel/);
  assert.match(catalogUiSource, /classStatusLabel\(item\.status\)/);
  assert.match(catalogUiSource, /item\.rosterCount/);
  assert.match(cards, /OPEN_CLASS_ACTION/);
  assert.doesNotMatch(cards, />Quản lý</);
  assert.equal(OPEN_CLASS_ACTION, 'Mở lớp');
  assert.match(classesSource, /rosterCount/);
  assert.match(routerSource, /onOpenClass/);
  const detail = routerSource.slice(
    routerSource.indexOf('function ClassDetail'),
    routerSource.indexOf('function StudentRoster'),
  );
  assert.match(detail, /<details/);
  assert.match(detail, /<summary>\s*Quản lý lớp\s*<\/summary>/);
  assert.ok(detail.indexOf('homeroom-tabs') < detail.indexOf('ClassManagePanel'));
});

test('homeroom class catalog CSS stays one-column on mobile with visible focus and 44px targets', () => {
  assert.match(cssSource, /\.homeroom-view\s*\{[^}]*overflow-x:\s*clip/);
  assert.match(cssSource, /:focus-visible/);
  assert.match(cssSource, /min-height:\s*44px/);
  assert.match(cssSource, /@media\s*\(max-width:\s*720px\)/);
  const mobile = cssSource.slice(cssSource.lastIndexOf('@media (max-width: 720px)'));
  assert.match(mobile, /flex-direction:\s*column/);
  assert.match(mobile, /grid-template-columns:\s*1fr/);
  assert.match(cssSource, /\.homeroom-class-cards/);
  assert.match(cssSource, /\.homeroom-manage-class-list/);
  assert.match(cssSource, /\.homeroom-quick-assign/);
  assert.match(cssSource, /\.homeroom-manage-disclosure\s*>\s*summary\s*\{[^}]*min-height:\s*44px/);
});

test('class workspace navigation exposes the current route and usable mobile overflow', () => {
  const detail = routerSource.slice(
    routerSource.indexOf('function ClassDetail'),
    routerSource.indexOf('function StudentRoster'),
  );
  assert.match(detail, /className="homeroom-overview-button"/);
  assert.match(detail, /className="homeroom-tabs"\s+aria-label="Điều hướng lớp"/);
  assert.doesNotMatch(detail, /role="tab"/);
  assert.match(detail, /aria-current=\{rosterTab \? 'page' : undefined\}/);
  assert.match(detail, /aria-current=\{tab === 'diem-danh' \? 'page' : undefined\}/);
  assert.doesNotMatch(detail, /role="tabpanel"/);
  assert.match(cssSource, /@media\s*\(max-width:\s*720px\)[\s\S]*\.homeroom-tabs\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(cssSource, /@media\s*\(max-width:\s*720px\)[\s\S]*\.homeroom-tabs button\s*\{[^}]*width:\s*auto/);
});

test('listScoped is teacher overview; catalog and attendance import use separate queries', () => {
  const query = classesSource.slice(
    classesSource.indexOf('export const listScoped'),
    classesSource.indexOf('export const listCatalog'),
  );
  assert.match(query, /includeArchived:\s*v\.optional\(v\.boolean\(\)\)/);
  assert.match(query, /assertCanIncludeArchivedClasses/);
  assert.match(query, /classIncludedInScopedList/);
  assert.match(query, /resolveClassScope/);
  const catalogQuery = classesSource.slice(
    classesSource.indexOf('export const listCatalog'),
    classesSource.indexOf('export const listForAttendanceImport'),
  );
  assert.match(catalogQuery, /homeroomCatalogWriterOrThrow/);
  assert.match(catalogQuery, /resolveCatalogScope/);
  assert.match(catalogQuery, /includeArchived/);
  assert.match(catalogQuery, /currentHomeroomTeacher/);
  assert.match(catalogUiSource, /listCatalog/);
  assert.match(catalogUiSource, /includeArchived:\s*true/);
  assert.match(catalogUiSource, /QuickHomeroomTeacherAssign/);
  assert.match(reportsSource, /row\.status !== ["']active["']/);
  const importView = routerSource.slice(
    routerSource.indexOf('function AttendanceImportView'),
    routerSource.indexOf('function AttendanceImportPreview'),
  );
  assert.match(importView, /listForAttendanceImport/);
  assert.doesNotMatch(importView, /listScoped/);
  assert.doesNotMatch(importView, /includeArchived:\s*true/);
  assert.match(importView, /filterActiveClasses/);
  assert.match(importView, /DOWNLOAD_ATTENDANCE_TEMPLATE_ACTION/);
  assert.deepEqual(
    filterActiveClasses([
      { _id: 'a', status: 'active', code: '6A1' },
      { _id: 'b', status: 'archived', code: '6A0' },
    ]),
    [{ _id: 'a', status: 'active', code: '6A1' }],
  );
});

test('archived class detail names the status, disables writes, and returns to overview', () => {
  const detail = routerSource.slice(
    routerSource.indexOf('function ClassDetail'),
    routerSource.indexOf('function StudentRoster'),
  );
  assert.match(detail, /classStatusLabel\(['"]archived['"]\)/);
  assert.match(detail, /BACK_TO_OVERVIEW/);
  assert.match(detail, /archived=\{archived\}/);
  assert.equal(BACK_TO_OVERVIEW, 'Về tổng quan');
  assert.match(catalogUiSource, /không thể thêm phân công/);
  assert.match(routerSource, /canImportRoster = !archived && Boolean\(session\?\.isOperationalManager\)/);
  assert.match(routerSource, /canImport = !archived && Boolean\(session\?\.isOperationalManager\)/);
  assert.match(detail, /IMPORT_ATTENDANCE_ACTION/);
  assert.doesNotMatch(detail, /menuAccess\?\.homeroom === ['"]view['"]/);
  assert.match(classesSource, /assertClassNotArchived/);
  assert.match(contextSource, /assertClassNotArchived/);
  assert.match(contextSource, /assertCanBulkImportRoster/);
});

test('assignment candidate query is homeroom-scoped, manager-guarded, and returns only safe fields', () => {
  assert.match(usersSource, /export const list = query/);
  assert.match(usersSource, /adminPermissionOrThrow\(ctx, "users:read"\)/);
  assert.doesNotMatch(catalogUiSource, /anyApi\.users\.list/);
  assert.doesNotMatch(routerSource, /anyApi\.users\.list/);
  assert.match(classesSource, /export const listAssignmentCandidates/);
  const query = classesSource.slice(
    classesSource.indexOf('export const listAssignmentCandidates'),
    classesSource.indexOf('export const listAssignmentCandidates') + 900,
  );
  assert.match(query, /homeroomCatalogWriterOrThrow/);
  assert.match(query, /toAssignmentCandidate/);
  assert.match(query, /isActiveAssignmentCandidate/);
  assert.doesNotMatch(query, /email/);
  assert.doesNotMatch(query, /phone/);
  assert.doesNotMatch(query, /mustChangePassword/);
  assert.doesNotMatch(query, /loginLockedAt/);
  const candidate = toAssignmentCandidate({
    _id: 'u1',
    name: '  GVCN A  ',
    role: 'user',
    email: 'secret@school.test',
    phone: '0900000000',
    mustChangePassword: true,
  });
  assert.deepEqual(candidate, { _id: 'u1', name: 'GVCN A', role: 'user' });
  assert.equal('email' in candidate, false);
  assert.equal('phone' in candidate, false);
  assert.equal(isActiveAssignmentCandidate({ status: 'active' }), true);
  assert.equal(isActiveAssignmentCandidate({ status: 'disabled' }), false);
  assert.deepEqual(toSafeAssignmentUser(null, 'gone-1'), {
    _id: 'gone-1',
    name: 'Người dùng không còn hoạt động',
    role: '',
  });
  assert.match(catalogUiSource, /listAssignmentCandidates/);
  assert.match(catalogUiSource, /['"]skip['"]/);
  assert.match(classesSource, /toSafeAssignmentUser/);
});
