import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AVATAR_MAX_BYTES,
  avatarStoredFile,
  detectAvatarKind,
  hexFromBuffer,
  publicSessionUser,
} from '../convex/userAvatarPolicy.ts';
import {
  centeredOffset,
  clampOffset,
  displaySize,
  offsetAfterZoom,
  sourceCropRect,
} from '../src/lib/avatarCrop.js';
import { isAllowedAvatarFile } from '../src/lib/prepareAvatarFile.js';
import {
  avatarDownloadUrl,
  avatarSessionFromCommit,
  nextAvatarObjectUrl,
  resolveProfileAvatarSession,
  shouldDropAvatarOverlay,
  userDisplayName,
  userInitials,
} from '../src/lib/profileAvatar.js';
import { matchAvatarFileRoute } from '../scripts/lib/file-route-policy.mjs';
import { messageFor } from '../src/lib/appErrorMessage.js';

test('detectAvatarKind reads JPEG, PNG and WEBP magic bytes', () => {
  assert.equal(detectAvatarKind(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(
    detectAvatarKind(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'png',
  );
  const webp = new Uint8Array(12);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  assert.equal(detectAvatarKind(webp), 'webp');
  assert.equal(detectAvatarKind(Uint8Array.from([0x00, 0x01, 0x02])), null);
});

test('avatarStoredFile uses a stable private filename', () => {
  assert.deepEqual(avatarStoredFile('jpeg'), { fileName: 'avatar.jpg', contentType: 'image/jpeg' });
  assert.deepEqual(avatarStoredFile('png'), { fileName: 'avatar.png', contentType: 'image/png' });
  assert.deepEqual(avatarStoredFile('webp'), { fileName: 'avatar.webp', contentType: 'image/webp' });
  assert.equal(AVATAR_MAX_BYTES, 2 * 1024 * 1024);
});

test('publicSessionUser strips storage ids and exposes cache version', () => {
  const published = publicSessionUser({
    _id: 'user-1',
    name: 'Lan',
    email: 'lan@school.vn',
    avatarStorageId: 'kg123',
    avatarFileName: 'avatar.webp',
    avatarContentType: 'image/webp',
    avatarSize: 1200,
    avatarChecksum: 'abc123',
    avatarUpdatedAt: 99,
  });
  assert.equal(published.hasAvatar, true);
  assert.equal(published.avatarVersion, 'abc123');
  assert.equal(published.name, 'Lan');
  assert.equal('avatarStorageId' in published, false);
  assert.equal('avatarChecksum' in published, false);
  assert.equal('avatarFileName' in published, false);
});

test('hexFromBuffer lowercases sha bytes', () => {
  assert.equal(hexFromBuffer(Uint8Array.from([0x0a, 0xff]).buffer), '0aff');
});

test('web picker accepts image files only', () => {
  assert.equal(isAllowedAvatarFile({ name: 'me.jpg', type: 'image/jpeg' }), true);
  assert.equal(isAllowedAvatarFile({ name: 'me.webp', type: '' }), true);
  assert.equal(isAllowedAvatarFile({ name: 'notes.pdf', type: 'application/pdf' }), false);
});

test('1:1 cover crop is a centered square', () => {
  const cropSize = 200;
  const shown = displaySize(800, 400, cropSize, 1);
  const offset = centeredOffset(shown.width, shown.height, cropSize);
  const rect = sourceCropRect(800, 400, cropSize, 1, offset.x, offset.y);
  assert.equal(shown.width, 400);
  assert.equal(shown.height, 200);
  assert.equal(offset.x, -100);
  assert.equal(offset.y, 0);
  assert.equal(rect.x, 200);
  assert.equal(rect.y, 0);
  assert.equal(rect.size, 400);
});

test('zoom keeps a 1:1 source rect inside the image', () => {
  const cropSize = 200;
  const shown = displaySize(800, 400, cropSize, 2);
  const offset = centeredOffset(shown.width, shown.height, cropSize);
  const rect = sourceCropRect(800, 400, cropSize, 2, offset.x, offset.y);
  assert.equal(rect.size, 200);
  assert.equal(rect.x, 300);
  assert.equal(rect.y, 100);
  const clamped = clampOffset(80, 40, shown.width, shown.height, cropSize);
  assert.equal(clamped.x, 0);
  assert.equal(clamped.y, 0);
});

test('zoom around the crop center keeps the same image point', () => {
  const before = centeredOffset(400, 200, 200);
  const after = offsetAfterZoom({
    imageWidth: 800,
    imageHeight: 400,
    cropSize: 200,
    oldZoom: 1,
    newZoom: 2,
    offsetX: before.x,
    offsetY: before.y,
  });
  const rect = sourceCropRect(800, 400, 200, 2, after.x, after.y);
  assert.equal(rect.size, 200);
  assert.equal(rect.x, 300);
  assert.equal(rect.y, 100);
});

test('gateway matches /api/files/avatar before a document id', () => {
  assert.deepEqual(matchAvatarFileRoute('GET', '/api/files/avatar'), { kind: 'download' });
  assert.deepEqual(matchAvatarFileRoute('GET', '/api/files/avatar/metadata'), { kind: 'metadata' });
  assert.equal(matchAvatarFileRoute('POST', '/api/files/avatar'), null);
  assert.equal(matchAvatarFileRoute('GET', '/api/files/office123'), null);
});

test('avatar error codes have Vietnamese copy', () => {
  assert.equal(messageFor(new Error('INVALID_AVATAR_FILE')), 'Ảnh đại diện phải là PNG, JPG hoặc WEBP.');
  assert.equal(messageFor(new Error('AVATAR_FILE_TOO_LARGE')), 'Ảnh đại diện không được vượt quá 2MB.');
  assert.equal(
    messageFor(new Error('AVATAR_UPLOAD_FAILED')),
    'Không thể cập nhật ảnh đại diện. Vui lòng thử lại.',
  );
});

test('web profile crops 1:1 then uploads WebP through Convex Storage', () => {
  const profile = readFileSync(new URL('../src/profile/InternalProfilePanel.jsx', import.meta.url), 'utf8');
  const cropModal = readFileSync(new URL('../src/profile/AvatarCropModal.jsx', import.meta.url), 'utf8');
  const prepare = readFileSync(new URL('../src/lib/prepareAvatarFile.js', import.meta.url), 'utf8');
  assert.match(profile, /anyApi\.userAvatar\.generateUploadUrl/);
  assert.match(profile, /useAction\(anyApi\.userAvatar\.setOwnAvatar\)/);
  assert.match(profile, /anyApi\.userAvatar\.clearOwnAvatar/);
  assert.match(profile, /AvatarCropModal/);
  assert.match(profile, /openAvatarCrop/);
  assert.match(profile, /cancelAvatarCrop/);
  assert.match(profile, /image\/webp/);
  assert.doesNotMatch(profile, /storage\.getUrl/);
  assert.match(cropModal, /Cắt ảnh/);
  assert.match(cropModal, /Hủy/);
  assert.match(cropModal, /Lưu/);
  assert.match(cropModal, /encodeCroppedAvatar/);
  assert.match(prepare, /image\/webp/);
  assert.match(prepare, /avatar\.webp/);
});

test('web profile shows the cropped blob immediately and overlays stale session avatar fields', () => {
  const profile = readFileSync(new URL('../src/profile/InternalProfilePanel.jsx', import.meta.url), 'utf8');
  const avatarHook = readFileSync(new URL('../src/profile/useOwnAvatar.jsx', import.meta.url), 'utf8');
  assert.match(avatarHook, /resolveProfileAvatarSession\(user, avatarOverlay\)/);
  assert.match(avatarHook, /avatarDownloadUrl\(avatarVersion\)/);
  assert.match(avatarHook, /cache: 'no-store'/);
  assert.match(avatarHook, /resolvedAvatar\.source === 'overlay'/);
  assert.match(profile, /avatarSessionFromCommit\(committed/);
  assert.match(profile, /showAvatarBlob\(prepared\)/);
  assert.match(profile, /showAvatarBlob\(null\)/);
  assert.match(profile, /setAvatarOverlay\(avatarSessionFromCommit\(committed/);
  assert.match(avatarHook, /shouldDropAvatarOverlay\(user, avatarOverlay\)/);
});

test('avatarDownloadUrl cache-busts with avatarVersion', () => {
  assert.equal(avatarDownloadUrl(''), '/api/files/avatar');
  assert.equal(avatarDownloadUrl('abc123'), '/api/files/avatar?v=abc123');
  assert.equal(avatarDownloadUrl('a b'), '/api/files/avatar?v=a%20b');
});

test('userDisplayName and userInitials match the current profile fallback', () => {
  assert.equal(userDisplayName({ name: 'Admin' }), 'Admin');
  assert.equal(userDisplayName({ email: 'admin@example.school' }), 'admin@example.school');
  assert.equal(userDisplayName({}, 'Chưa đặt tên'), 'Chưa đặt tên');
  assert.equal(userInitials('Nguyễn Năng Quốc Bảo'), 'QB');
  assert.equal(userInitials('Admin'), 'A');
  assert.equal(userInitials(''), 'LV');
});

test('avatarSessionFromCommit mirrors set/clear payloads onto session fields', () => {
  assert.deepEqual(avatarSessionFromCommit({ hasAvatar: true, avatarVersion: 'abc123' }), {
    hasAvatar: true,
    avatarVersion: 'abc123',
  });
  assert.deepEqual(avatarSessionFromCommit({ hasAvatar: true }, 'local-1'), {
    hasAvatar: true,
    avatarVersion: 'local-1',
  });
  assert.deepEqual(avatarSessionFromCommit({ hasAvatar: false, avatarVersion: null }), {
    hasAvatar: false,
    avatarVersion: '',
  });
  assert.deepEqual(avatarSessionFromCommit({}), {
    hasAvatar: false,
    avatarVersion: '',
  });
});

test('profile avatar overlay keeps the new photo when session hasAvatar/avatarVersion are stale', () => {
  const stale = { hasAvatar: true, avatarVersion: 'old' };
  const afterSet = avatarSessionFromCommit({ hasAvatar: true, avatarVersion: 'new' });
  const shown = resolveProfileAvatarSession(stale, afterSet);
  assert.equal(shown.hasAvatar, true);
  assert.equal(shown.avatarVersion, 'new');
  assert.equal(shown.source, 'overlay');
  assert.equal(shouldDropAvatarOverlay(stale, afterSet), false);

  const afterClear = avatarSessionFromCommit({ hasAvatar: false, avatarVersion: null });
  const cleared = resolveProfileAvatarSession(stale, afterClear);
  assert.equal(cleared.hasAvatar, false);
  assert.equal(cleared.avatarVersion, '');
  assert.equal(cleared.source, 'overlay');
  assert.equal(shouldDropAvatarOverlay(stale, afterClear), false);

  const live = { hasAvatar: true, avatarVersion: 'new' };
  assert.equal(shouldDropAvatarOverlay(live, afterSet), true);
  assert.equal(resolveProfileAvatarSession(live, afterSet).source, 'session');
  assert.equal(shouldDropAvatarOverlay({ hasAvatar: false, avatarVersion: null }, afterClear), true);
});

test('local overlay fallback stays until session version matches exactly', () => {
  const overlay = avatarSessionFromCommit({ hasAvatar: true }, 'local-99');
  assert.equal(shouldDropAvatarOverlay({ hasAvatar: true, avatarVersion: 'old' }, overlay), false);
  assert.equal(shouldDropAvatarOverlay({ hasAvatar: true, avatarVersion: 'from-server' }, overlay), false);
  assert.equal(shouldDropAvatarOverlay({ hasAvatar: true, avatarVersion: 'local-99' }, overlay), true);
});

test('nextAvatarObjectUrl always mints a new object URL and revokes the previous blob', () => {
  const revoked = [];
  const created = [];
  const create = (blob) => {
    const url = `blob:${created.length}:${blob.type}`;
    created.push(url);
    return url;
  };
  const revoke = (url) => revoked.push(url);
  const first = nextAvatarObjectUrl('', { type: 'image/webp' }, create, revoke);
  const second = nextAvatarObjectUrl(first, { type: 'image/webp' }, create, revoke);
  const cleared = nextAvatarObjectUrl(second, null, create, revoke);
  assert.equal(first, 'blob:0:image/webp');
  assert.equal(second, 'blob:1:image/webp');
  assert.equal(cleared, '');
  assert.deepEqual(revoked, ['blob:0:image/webp', 'blob:1:image/webp']);
  assert.equal(created.length, 2);
});

test('sessionContext sanitizes the user row', () => {
  const users = readFileSync(new URL('../convex/users.ts', import.meta.url), 'utf8');
  assert.match(users, /publicSessionUser\(user/);
});

test('native apps crop 1:1 then upload WebP through the same Convex Storage mutation', () => {
  const android = readFileSync(
    new URL('../android-app/app/src/main/java/lvt/crm/data/auth/AvatarRepository.kt', import.meta.url),
    'utf8',
  );
  const androidCrop = readFileSync(
    new URL('../android-app/app/src/main/java/lvt/crm/ui/profile/AvatarCropScreen.kt', import.meta.url),
    'utf8',
  );
  const ios = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/AvatarRepository.swift', import.meta.url), 'utf8');
  const iosCrop = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/AvatarCrop.swift', import.meta.url), 'utf8');
  const androidProfile = readFileSync(
    new URL('../android-app/app/src/main/java/lvt/crm/ui/profile/ProfileScreen.kt', import.meta.url),
    'utf8',
  );
  const iosProfile = readFileSync(
    new URL('../ios-uikit-lvt/LvtCrmUIKit/ProfileViewController.swift', import.meta.url),
    'utf8',
  );
  assert.match(android, /userAvatar:generateUploadUrl/);
  assert.match(android, /userAvatar:setOwnAvatar/);
  assert.match(android, /convex\.action\(\s*"userAvatar:setOwnAvatar"/);
  assert.match(android, /\/api\/files\/avatar/);
  assert.match(android, /image\/webp/);
  assert.match(android, /avatar\.webp/);
  assert.match(ios, /userAvatar:generateUploadUrl/);
  assert.match(ios, /convex\.action\("userAvatar:setOwnAvatar"/);
  assert.match(ios, /\/api\/files\/avatar/);
  assert.match(ios, /AvatarCrop\.encodeWebP/);
  assert.match(iosCrop, /UTType\.webP|public\.webp/);
  assert.match(androidProfile, /PickVisualMedia/);
  assert.match(androidProfile, /AvatarCropScreen/);
  assert.match(androidProfile, /authRepository\.refreshSession\(\)/);
  assert.match(androidCrop, /Cắt ảnh/);
  assert.match(androidCrop, /Hủy/);
  assert.match(androidCrop, /Lưu/);
  assert.doesNotMatch(androidProfile, /prepareAvatarJpeg/);
  assert.doesNotMatch(androidProfile, /uploadJpeg/);
  assert.match(iosProfile, /PHPickerViewController/);
  assert.match(iosProfile, /UIImagePickerController/);
  assert.match(iosProfile, /AvatarCropViewController/);
  assert.match(iosProfile, /presentCrop/);
  assert.doesNotMatch(android, /storage\.getUrl/);
  assert.doesNotMatch(ios, /storage\.getUrl/);
});

test('native changelogs mention crop plus WebP and bump versions', () => {
  const androidChangelog = readFileSync(
    new URL('../android-app/app/src/main/java/lvt/crm/ui/profile/AppChangelog.kt', import.meta.url),
    'utf8',
  );
  const iosChangelog = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/AppChangelog.swift', import.meta.url), 'utf8');
  const androidGradle = readFileSync(new URL('../android-app/app/build.gradle.kts', import.meta.url), 'utf8');
  const iosPbx = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
  assert.match(androidChangelog, /"0\.18\.0"/);
  assert.match(androidChangelog, /cắt khung 1:1/);
  assert.match(androidChangelog, /WebP/);
  assert.match(androidGradle, /val lvtVersionCode = 41/);
  assert.match(androidGradle, /val lvtVersionName = "0\.18\.0"/);
  assert.match(iosChangelog, /version: "1\.10\.0"/);
  assert.match(iosChangelog, /cắt khung 1:1/);
  assert.match(iosChangelog, /WebP/);
  assert.match(iosPbx, /MARKETING_VERSION = 1\.10\.0;/);
  assert.match(iosPbx, /CURRENT_PROJECT_VERSION = 29;/);
});
