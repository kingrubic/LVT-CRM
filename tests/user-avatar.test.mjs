import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AVATAR_MAX_BYTES,
  avatarStoredFile,
  detectAvatarKind,
  hexFromBuffer,
  publicSessionUser,
} from '../convex/userAvatar.ts';
import { isAllowedAvatarFile } from '../src/lib/prepareAvatarFile.js';
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
  assert.equal(AVATAR_MAX_BYTES, 2 * 1024 * 1024);
});

test('publicSessionUser strips storage ids and exposes cache version', () => {
  const published = publicSessionUser({
    _id: 'user-1',
    name: 'Lan',
    email: 'lan@school.vn',
    avatarStorageId: 'kg123',
    avatarFileName: 'avatar.jpg',
    avatarContentType: 'image/jpeg',
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

test('web profile uploads through Convex Storage then setOwnAvatar', () => {
  const profile = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(profile, /anyApi\.userAvatar\.generateUploadUrl/);
  assert.match(profile, /useAction\(anyApi\.userAvatar\.setOwnAvatar\)/);
  assert.match(profile, /anyApi\.userAvatar\.clearOwnAvatar/);
  assert.match(profile, /fetch\('\/api\/files\/avatar'/);
  assert.match(profile, /prepareAvatarFile/);
  assert.doesNotMatch(profile, /storage\.getUrl/);
});

test('sessionContext sanitizes the user row', () => {
  const users = readFileSync(new URL('../convex/users.ts', import.meta.url), 'utf8');
  assert.match(users, /publicSessionUser\(user/);
});

test('native apps upload avatars through the same Convex Storage mutation', () => {
  const android = readFileSync(
    new URL('../android-app/app/src/main/java/lvt/crm/data/auth/AvatarRepository.kt', import.meta.url),
    'utf8',
  );
  const ios = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/AvatarRepository.swift', import.meta.url), 'utf8');
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
  assert.match(ios, /userAvatar:generateUploadUrl/);
  assert.match(ios, /convex\.action\("userAvatar:setOwnAvatar"/);
  assert.match(ios, /\/api\/files\/avatar/);
  assert.match(androidProfile, /PickVisualMedia/);
  assert.match(iosProfile, /PHPickerViewController/);
  assert.match(iosProfile, /UIImagePickerController/);
  assert.doesNotMatch(android, /storage\.getUrl/);
  assert.doesNotMatch(ios, /storage\.getUrl/);
});
