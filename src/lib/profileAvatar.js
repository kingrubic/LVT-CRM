/** Cache-bust private avatar downloads when the session version changes. */
export function avatarDownloadUrl(avatarVersion) {
  const version = String(avatarVersion || '').trim();
  if (!version) return '/api/files/avatar';
  return `/api/files/avatar?v=${encodeURIComponent(version)}`;
}

/**
 * Normalize `userAvatar:setOwnAvatar` / `clearOwnAvatar` payloads into the same
 * `hasAvatar` / `avatarVersion` fields that `sessionContext` publishes.
 */
export function avatarSessionFromCommit(result, fallbackVersion = '') {
  const hasAvatar = Boolean(result?.hasAvatar);
  if (!hasAvatar) {
    return { hasAvatar: false, avatarVersion: '' };
  }
  const version = String(result?.avatarVersion || fallbackVersion || '').trim();
  return { hasAvatar: true, avatarVersion: version };
}

/**
 * Keep the post-commit overlay until the live session catches up. Convex actions
 * do not reliably refresh `useQuery(sessionContext)` on the calling client, so
 * the profile UI must not wait on `user.hasAvatar` / `user.avatarVersion`.
 */
export function resolveProfileAvatarSession(session, overlay) {
  const sessionHasAvatar = Boolean(session?.hasAvatar);
  const sessionAvatarVersion = String(session?.avatarVersion || '');
  if (!overlay) {
    return { hasAvatar: sessionHasAvatar, avatarVersion: sessionAvatarVersion, source: 'session' };
  }
  const overlayHasAvatar = Boolean(overlay.hasAvatar);
  const overlayVersion = String(overlay.avatarVersion || '');
  if (overlayHasAvatar === sessionHasAvatar && overlayVersion === sessionAvatarVersion) {
    return { hasAvatar: sessionHasAvatar, avatarVersion: sessionAvatarVersion, source: 'session' };
  }
  return { hasAvatar: overlayHasAvatar, avatarVersion: overlayVersion, source: 'overlay' };
}

export function shouldDropAvatarOverlay(session, overlay) {
  if (!overlay) return false;
  const sessionHasAvatar = Boolean(session?.hasAvatar);
  const sessionAvatarVersion = String(session?.avatarVersion || '');
  const overlayHasAvatar = Boolean(overlay.hasAvatar);
  if (overlayHasAvatar !== sessionHasAvatar) return false;
  if (!overlayHasAvatar) return true;
  const overlayVersion = String(overlay.avatarVersion || '');
  return overlayVersion === sessionAvatarVersion;
}

export function revokeAvatarObjectUrl(url, revokeObjectURL = URL.revokeObjectURL) {
  if (url && String(url).startsWith('blob:')) {
    revokeObjectURL(url);
  }
}

/** Replace the displayed object URL; always create a new blob URL for a new file. */
export function nextAvatarObjectUrl(
  previousUrl,
  blob,
  createObjectURL = URL.createObjectURL,
  revokeObjectURL = URL.revokeObjectURL,
) {
  revokeAvatarObjectUrl(previousUrl, revokeObjectURL);
  if (!blob) return '';
  return createObjectURL(blob);
}
