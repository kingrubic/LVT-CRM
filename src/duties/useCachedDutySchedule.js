import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import {
  displayedDutySchedule,
  dutyScheduleCacheKey,
  planDutyScheduleRead,
  readBrowserDutyScheduleCache,
  writeBrowserDutyScheduleCache,
} from './dutyScheduleCache.js';

function liveMatchesWindow(live, startDate, endDate, userId) {
  if (!live) return false;
  if (live.startDate && startDate && live.startDate !== startDate) return false;
  if (live.endDate && endDate && live.endDate !== endDate) return false;
  if (userId && live.selectedUserId && String(live.selectedUserId) !== String(userId)) return false;
  return true;
}

/**
 * Paint Lịch công tác from IndexedDB when the 24h payload's stamp still matches.
 * A fresh window subscribes only to the cheap revision query. A miss, expiry,
 * or stamp change subscribes to the existing schedule query and keeps that
 * subscription until the user leaves this window, so edits stay live.
 */
export function useCachedDutySchedule({
  userId = '',
  view,
  mode,
  startDate,
  endDate,
  selectedUserId = '',
  revisionQuery,
  dataQuery,
  queryArgs,
  prepare = null,
}) {
  const cacheKey = userId && startDate && endDate
    ? dutyScheduleCacheKey({
      userId,
      view,
      mode,
      startDate,
      endDate,
      selectedUserId,
    })
    : '';
  const [slot, setSlot] = useState({ key: '', checked: false, entry: null });
  const slotMatches = Boolean(cacheKey) && slot.key === cacheKey;
  const entry = slotMatches ? slot.entry : null;
  const checked = cacheKey ? slotMatches && slot.checked : true;

  useEffect(() => {
    if (!cacheKey) return undefined;
    let cancelled = false;
    const key = cacheKey;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setSlot((current) => (
        current.key === key && current.checked ? current : { key, checked: true, entry: null }
      ));
    }, 1500);
    readBrowserDutyScheduleCache(key).then((found) => {
      if (cancelled) return;
      clearTimeout(timeout);
      setSlot({ key, checked: true, entry: found });
    }).catch(() => {
      if (cancelled) return;
      clearTimeout(timeout);
      setSlot({ key, checked: true, entry: null });
    });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [cacheKey]);

  const liveHold = useRef({ key: '', hold: false });
  if (liveHold.current.key !== cacheKey) {
    liveHold.current = { key: cacheKey, hold: false };
  }
  const revisionGate = planDutyScheduleRead({
    enabled: Boolean(cacheKey),
    checked,
    entry,
    revision: undefined,
  });
  const subscribeRevision = revisionGate.fetchRevision && !liveHold.current.hold;
  const revisionState = useQuery(
    revisionQuery,
    subscribeRevision ? queryArgs : 'skip',
  );
  const plan = planDutyScheduleRead({
    enabled: Boolean(cacheKey),
    checked,
    entry,
    revision: revisionState === undefined ? undefined : (revisionState.revision ? String(revisionState.revision) : null),
  });
  const subscribeLive = plan.fetchLive || liveHold.current.hold;
  const live = useQuery(dataQuery, subscribeLive ? queryArgs : 'skip');

  useEffect(() => {
    if (!cacheKey || live === undefined || !liveMatchesWindow(live, startDate, endDate, queryArgs?.userId)) {
      return undefined;
    }
    liveHold.current = { key: cacheKey, hold: true };
    return undefined;
  }, [cacheKey, live, startDate, endDate, queryArgs?.userId]);

  useEffect(() => {
    if (!cacheKey || !userId || live === undefined || !live?.revision) return undefined;
    if (!liveMatchesWindow(live, startDate, endDate, queryArgs?.userId)) return undefined;
    const next = {
      key: cacheKey,
      userId,
      view,
      revision: String(live.revision),
      storedAt: Date.now(),
      data: live,
    };
    setSlot({ key: cacheKey, checked: true, entry: next });
    writeBrowserDutyScheduleCache(next).catch(() => {});
    return undefined;
  }, [cacheKey, userId, view, startDate, endDate, queryArgs?.userId, live]);

  const displayed = displayedDutySchedule(plan, live, entry);
  return useMemo(
    () => (displayed === undefined || prepare == null ? displayed : prepare(displayed)),
    [displayed, prepare],
  );
}
