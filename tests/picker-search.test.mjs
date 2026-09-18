import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  filterByPickerSearch,
  matchesPickerSearch,
  normalizePickerSearch,
  personPickerHaystack,
} from '../src/lib/pickerSearch.js';

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const assignmentSource = readFileSync(new URL('../src/work/WorkAssignmentRows.jsx', import.meta.url), 'utf8');
const workViewsSource = readFileSync(new URL('../src/work/WorkViews.jsx', import.meta.url), 'utf8');

test('picker search ignores Vietnamese diacritics and đ', () => {
  assert.equal(normalizePickerSearch(' Nguyễn  Văn  Đạt '), 'nguyen van dat');
  assert.equal(matchesPickerSearch('Nguyễn Văn Đạt · dat@lvt.vn', 'nguyen dat'), true);
  assert.equal(matchesPickerSearch('Trần Anh Vũ', 'tran anh vu'), true);
  assert.equal(matchesPickerSearch('Phòng Kế toán', 'ke toan'), true);
  assert.equal(matchesPickerSearch('Nguyễn Văn A', 'tran'), false);
});

test('filterByPickerSearch keeps the original order and empty query returns all', () => {
  const people = [
    { _id: '1', name: 'Nguyễn Văn A', email: 'a@lvt.vn', departmentName: 'Kế toán' },
    { _id: '2', name: 'Trần Thị Bình', email: 'binh@lvt.vn', departmentName: 'Hành chính' },
    { _id: '3', name: 'Lê Đức Đạt', email: 'dat@lvt.vn', departmentName: 'Kế toán' },
  ];
  assert.deepEqual(
    filterByPickerSearch(people, '', personPickerHaystack).map((person) => person._id),
    ['1', '2', '3'],
  );
  assert.deepEqual(
    filterByPickerSearch(people, 'ke toan', personPickerHaystack).map((person) => person._id),
    ['1', '3'],
  );
  assert.deepEqual(
    filterByPickerSearch(people, 'binh@lvt', personPickerHaystack).map((person) => person._id),
    ['2'],
  );
});

test('duty and work person pickers include a small search field', () => {
  const pickerSource = readFileSync(new URL('../src/lib/CollapsibleMultiCheckList.jsx', import.meta.url), 'utf8');
  assert.match(mainSource, /CollapsibleMultiCheckList/);
  assert.match(pickerSource, /export default function CollapsibleMultiCheckList/);
  assert.match(pickerSource, /multi-check-search/);
  assert.match(mainSource, /Tìm theo tên, email/);
  assert.match(assignmentSource, /SearchablePersonSelect/);
  assert.match(assignmentSource, /Tìm theo tên, email/);
  assert.match(workViewsSource, /function PersonalTaskAssignModal/);
  assert.match(workViewsSource, /work-person-search/);
  assert.match(workViewsSource, /Tìm người thực hiện/);
});
