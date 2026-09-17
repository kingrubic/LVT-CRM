import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useConvexAuth } from '@convex-dev/auth/react';
import {
  avatarDownloadUrl,
  nextAvatarObjectUrl,
  resolveProfileAvatarSession,
  shouldDropAvatarOverlay,
  userDisplayName,
  userInitials,
} from '../lib/profileAvatar.js';

const OwnAvatarContext = createContext(null);

export function useOwnAvatar(user) {
  const { fetchAccessToken } = useConvexAuth();
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarOverlay, setAvatarOverlay] = useState(null);
  const avatarUrlRef = useRef('');
  const fetchAccessTokenRef = useRef(fetchAccessToken);
  fetchAccessTokenRef.current = fetchAccessToken;

  const displayName = userDisplayName(user);
  const initials = userInitials(displayName);
  const resolvedAvatar = resolveProfileAvatarSession(user, avatarOverlay);
  const hasAvatar = resolvedAvatar.hasAvatar;
  const avatarVersion = resolvedAvatar.avatarVersion;

  const showAvatarBlob = (blob) => {
    const nextUrl = nextAvatarObjectUrl(avatarUrlRef.current, blob);
    avatarUrlRef.current = nextUrl;
    setAvatarUrl(nextUrl);
  };

  useEffect(() => {
    if (shouldDropAvatarOverlay(user, avatarOverlay)) {
      setAvatarOverlay(null);
    }
  }, [user, avatarOverlay]);

  useEffect(() => {
    let cancelled = false;
    if (!hasAvatar) {
      showAvatarBlob(null);
      return undefined;
    }
    if (resolvedAvatar.source === 'overlay' && avatarUrlRef.current) {
      return undefined;
    }
    (async () => {
      try {
        const token = await fetchAccessTokenRef.current?.({ forceRefreshToken: false });
        if (!token || cancelled) return;
        const response = await fetch(avatarDownloadUrl(avatarVersion), {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          if (!cancelled && (response.status === 404 || response.status === 403)) {
            showAvatarBlob(null);
          }
          return;
        }
        const blob = await response.blob();
        if (cancelled) return;
        showAvatarBlob(blob);
      } catch {
        /* Keep initials fallback. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAvatar, avatarVersion, resolvedAvatar.source]);

  useEffect(() => () => {
    showAvatarBlob(null);
  }, []);

  return {
    avatarUrl,
    avatarOverlay,
    displayName,
    hasAvatar,
    initials,
    resolvedAvatar,
    setAvatarOverlay,
    showAvatarBlob,
  };
}

export function OwnAvatarProvider({ user, children }) {
  const value = useOwnAvatar(user);
  return <OwnAvatarContext.Provider value={value}>{children}</OwnAvatarContext.Provider>;
}

export function useOwnAvatarContext() {
  const value = useContext(OwnAvatarContext);
  if (!value) {
    throw new Error('useOwnAvatarContext requires OwnAvatarProvider');
  }
  return value;
}
