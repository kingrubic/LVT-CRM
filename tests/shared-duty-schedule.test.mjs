import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildSharedScheduleRows,
  formatDayCell,
  formatDutyClock,
  formatParticipantCell,
  formatTimeCell,
  formatVnDate,
  scheduleRange,
  sharedScheduleFilename,
} from '../src/duties/sharedDutySchedule.js';
import { dutiesPathname, parseDutyPath } from '../src/duties/dutyRoutes.js';
import { buildSharedDutySchedulePdf } from '../src/duties/sharedDutySchedulePdf.js';
import { VIETNAMESE_PDF_FONT } from '../src/homeroom/homeroomExport.js';
import { parseSharedScheduleQuery } from '../scripts/lib/shared-duty-schedule-pdf.mjs';

const sampleEvents = [
  {
    _id: 'a',
    title: 'Chào cờ đầu tuần',
    startDate: '2026-09-07',
    endDate: '2026-09-07',
    startTime: '07:00',
    allDay: false,
    location: 'Trường',
    departmentNames: ['BGH'],
    participantNames: ['GVCN'],
  },
  {
    _id: 'b',
    title: 'Họp giao ban BGH',
    startDate: '2026-09-07',
    endDate: '2026-09-07',
    startTime: '09:00',
    allDay: false,
    location: 'Phòng truyền thống',
    departmentNames: ['BGH'],
    participantNames: [],
  },
  {
    _id: 'c',
    title: 'Khám sức khỏe học sinh khối 8, 9',
    startDate: '2026-09-08',
    endDate: '2026-09-08',
    startTime: '08:00',
    allDay: true,
    location: 'Trường',
    departmentNames: ['BGH'],
    participantNames: [],
  },
  {
    _id: 'd',
    title: 'Họp Ban nghiên cứu đề xuất nội dung phát triển chương trình',
    startDate: '2026-09-11',
    endDate: '2026-09-13',
    startTime: '08:00',
    allDay: false,
    location: 'Hải Phòng',
    departmentNames: [],
    participantNames: ['C. Xuân Oanh'],
  },
];

test('đường dẫn Lịch công tác có tab chung và trang tạo/sửa', () => {
  assert.equal(dutiesPathname(), '/cong-tac');
  assert.equal(dutiesPathname({ view: 'shared' }), '/cong-tac/chung');
  assert.equal(dutiesPathname({ view: 'create' }), '/cong-tac/tao');
  assert.equal(dutiesPathname({ view: 'edit', dutyId: 'abc' }), '/cong-tac/sua/abc');
  assert.equal(parseDutyPath('/cong-tac/chung').view, 'shared');
  assert.equal(parseDutyPath('/cong-tac/tao').view, 'create');
  assert.equal(parseDutyPath('/cong-tac/sua/abc').dutyId, 'abc');
  assert.equal(parseDutyPath('/cong-tac').view, 'personal');
});

test('format lịch chung khớp file Word mẫu tuần 07/9–12/9', () => {
  assert.equal(formatDutyClock('07:00'), '7g00');
  assert.equal(formatDutyClock('16:45'), '16g45');
  assert.equal(formatDutyClock('21:00'), '21g00');
  assert.equal(formatDayCell('2026-09-07'), 'Thứ Hai 07/9');
  assert.equal(formatVnDate('2026-09-07'), '07/9/2026');
  assert.equal(formatTimeCell({ startDate: '2026-09-07', endDate: '2026-09-07', allDay: true }), 'Cả ngày');
  assert.equal(
    formatTimeCell({ startDate: '2026-09-11', endDate: '2026-09-13', allDay: false, startTime: '08:00' }),
    'Từ 11/9 – 13/9',
  );

  const range = scheduleRange('week', '2026-09-09');
  assert.equal(range.startIso, '2026-09-07');
  assert.equal(range.endIso, '2026-09-12');
  assert.equal(range.title, 'LỊCH CÔNG TÁC TỪ NGÀY 07/9/2026 ĐẾN 12/9/2026');
  assert.equal(sharedScheduleFilename(range), 'LCT tu 07.9-12.9.pdf');

  const { rows } = buildSharedScheduleRows('week', '2026-09-09', sampleEvents);
  const monday = rows.filter((row) => row.dayIso === '2026-09-07');
  assert.equal(monday.length, 2);
  assert.equal(monday[0].showDay, true);
  assert.equal(monday[0].rowSpan, 2);
  assert.equal(monday[1].showDay, false);
  assert.equal(monday[0].time, '7g00');
  assert.equal(monday[1].time, '9g00');
  assert.equal(monday[0].participants, 'BGH, GVCN');

  const tuesday = rows.filter((row) => row.dayIso === '2026-09-08');
  assert.equal(tuesday[0].time, 'Cả ngày');

  const friday = rows.filter((row) => row.dayIso === '2026-09-11');
  assert.equal(friday[0].time, 'Từ 11/9 – 13/9');

  const saturday = rows.filter((row) => row.dayIso === '2026-09-12');
  assert.equal(saturday.length, 1);
  assert.equal(saturday[0].content, '');
  assert.equal(rows.some((row) => row.dayIso === '2026-09-13'), false);
  assert.equal(
    formatParticipantCell({
      departmentNames: ['BGH'],
      participantNames: ['GVCN'],
      otherParticipants: 'Đoàn Sở GD',
    }),
    'BGH, GVCN, Đoàn Sở GD',
  );
  assert.equal(
    formatParticipantCell({ departmentNames: [], participantNames: [], otherParticipants: 'Khách mời' }),
    'Khách mời',
  );
});

test('query PDF lịch chung chỉ nhận tuần/tháng và ngày ISO', () => {
  assert.deepEqual(
    parseSharedScheduleQuery(new URLSearchParams('mode=week&anchor=2026-09-11')),
    { mode: 'week', anchor: '2026-09-11' },
  );
  assert.deepEqual(
    parseSharedScheduleQuery(new URLSearchParams('mode=month&anchor=2026-09-01')),
    { mode: 'month', anchor: '2026-09-01' },
  );
  assert.throws(() => parseSharedScheduleQuery(new URLSearchParams('mode=year&anchor=2026-09-11')), /INVALID_DATE_RANGE/);
  assert.throws(() => parseSharedScheduleQuery(new URLSearchParams('mode=week')), /INVALID_DATE_RANGE/);
});

test('PDF lịch chung nhúng font tiếng Việt và giữ tiêu đề/cột của mẫu', async () => {
  const payload = buildSharedScheduleRows('week', '2026-09-09', sampleEvents);
  const built = buildSharedDutySchedulePdf(payload);
  assert.equal(Buffer.from(built.bytes.slice(0, 5)).toString('ascii'), '%PDF-');
  assert.equal(built.filename, 'LCT tu 07.9-12.9.pdf');
  assert.equal(built.doc.getFont().fontName, VIETNAMESE_PDF_FONT.family);
  const visible = built.visibleTexts.join('\n');
  assert.match(visible, /UBND PHƯỜNG BÌNH THẠNH/);
  assert.match(visible, /LÊ VĂN TÁM/);
  assert.match(visible, /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/);
  assert.match(visible, /Độc lập – Tự do – Hạnh phúc/);
  assert.match(visible, /LỊCH CÔNG TÁC TỪ NGÀY 07\/9\/2026 ĐẾN 12\/9\/2026/);
  assert.match(visible, /Ngày/);
  assert.match(visible, /Thời gian/);
  assert.match(visible, /Nội dung/);
  assert.match(visible, /Địa điểm/);
  assert.match(visible, /Thành phần/);
  assert.match(visible, /Chào cờ đầu tuần/);
  assert.match(visible, /7g00/);
  assert.match(visible, /Thứ Bảy/);
  assert.match(visible, /12\/9/);
  assert.match(visible, /Thứ Năm/);
});

test('UI Lịch công tác có 2 tab, lịch cá nhân dạng lịch, trang tạo riêng, và gỡ Báo cáo Công tác', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const tabs = readFileSync(new URL('../src/duties/DutyWorkspaceTabs.jsx', import.meta.url), 'utf8');
  const shared = readFileSync(new URL('../src/duties/SharedDutyScheduleView.jsx', import.meta.url), 'utf8');
  const personal = readFileSync(new URL('../src/reports/DutyReportsView.jsx', import.meta.url), 'utf8');
  assert.match(main, /\['duties', 'Lịch công tác'\]/);
  assert.match(main, /chooseDutyView\('create'\)|onDutyNavigate\?\.\('create'\)|onDutyNavigate\('create'\)/);
  assert.match(main, /SharedDutyScheduleView/);
  assert.match(main, /DutyReportsView/);
  assert.doesNotMatch(main, /Công tác của tôi/);
  assert.doesNotMatch(main, /Công tác tôi tạo/);
  assert.match(tabs, /Lịch công tác cá nhân/);
  assert.match(tabs, /Lịch công tác chung/);
  assert.match(shared, /Tải PDF/);
  assert.match(shared, /Tuần/);
  assert.match(shared, /Tháng/);
  assert.match(shared, /lct-shared-toolbar-center/);
  const tabCss = readFileSync(new URL('../src/duties/sharedDutySchedule.css', import.meta.url), 'utf8');
  assert.match(tabCss, /margin:\s*50px auto 18px/);
  assert.match(tabCss, /lct-shared-toolbar-center/);
  assert.match(personal, /reports\.dutyCalendar/);
  assert.match(personal, /Chọn một người để xem lịch công tác/);
  assert.match(personal, /Lịch công tác của/);
  assert.match(personal, /\['list', 'List'\]/);
  assert.match(personal, /\['week', 'Tuần'\]/);
  assert.match(personal, /\['month', 'Tháng'\]/);
  assert.match(personal, /\['year', 'Năm'\]/);
  assert.doesNotMatch(personal, /\['quarter', 'Quý'\]/);
  assert.match(personal, /useState\('week'\)/);
  assert.match(personal, /DutyListSearch/);
  assert.match(personal, /DutyListTabs/);
  assert.match(personal, /report-calendar-search/);
});

test('gateway PDF lịch chung dùng cùng builder web và bắt buộc query hợp lệ', () => {
  const server = readFileSync(new URL('../scripts/serve-production.mjs', import.meta.url), 'utf8');
  const helper = readFileSync(new URL('../scripts/lib/shared-duty-schedule-pdf.mjs', import.meta.url), 'utf8');
  assert.match(server, /\/api\/duties\/shared-schedule\.pdf/);
  assert.match(helper, /duties\.sharedSchedule/);
  assert.match(helper, /buildSharedDutySchedulePdf/);
});

test('native Lịch CT mở hub trên tab, PDF qua cùng gateway, deep link vào lịch cá nhân', () => {
  const androidRoot = readFileSync(new URL('../android-app/app/src/main/java/lvt/crm/ui/LvtRoot.kt', import.meta.url), 'utf8');
  const androidRepo = readFileSync(new URL('../android-app/app/src/main/java/lvt/crm/data/duties/DutiesRepository.kt', import.meta.url), 'utf8');
  const androidStrings = readFileSync(new URL('../android-app/app/src/main/res/values/strings.xml', import.meta.url), 'utf8');
  const iosRoot = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/RootTabBarController.swift', import.meta.url), 'utf8');
  const iosRepo = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/DutiesRepository.swift', import.meta.url), 'utf8');
  const androidHub = readFileSync(new URL('../android-app/app/src/main/java/lvt/crm/ui/duties/DutiesTabHost.kt', import.meta.url), 'utf8');
  const iosHub = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/DutiesHubViewController.swift', import.meta.url), 'utf8');
  assert.match(androidStrings, /Lịch CT/);
  assert.match(androidHub, /Lịch công tác cá nhân/);
  assert.match(androidHub, /Lịch công tác chung/);
  assert.match(androidHub, /heightIn\(min = 132\.dp\)/);
  assert.doesNotMatch(androidHub, /Modifier\s*\n\s*\.fillMaxSize\(\)\s*\n\s*\.padding\(horizontal = 20\.dp, vertical = 18\.dp\)/);
  assert.match(iosHub, /Lịch công tác cá nhân/);
  assert.match(iosHub, /Lịch công tác chung/);
  assert.match(iosHub, /fillEqually/);
  assert.match(androidRoot, /dutiesSkipHub/);
  assert.match(androidRoot, /DutiesTabHost/);
  assert.match(androidRepo, /\/api\/duties\/shared-schedule\.pdf/);
  assert.match(iosRoot, /title: "Lịch CT"/);
  assert.match(iosRoot, /shouldSelect/);
  assert.match(iosRoot, /openPersonal/);
  assert.match(iosRepo, /\/api\/duties\/shared-schedule\.pdf/);
});
