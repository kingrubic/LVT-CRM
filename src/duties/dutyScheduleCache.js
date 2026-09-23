/**
 * Browser cache for Lịch công tác.
 * IndexedDB holds the last heavy query payload for 24h.
 * A Convex revision query decides whether that payload is still current.
 */

export const DUTY_SCHEDULE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const DB_NAME = 'lvt-duty-schedule';
const STORE_NAME = 'windows';
const DB_VERSION = 1;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function dutyScheduleCacheKey({
  userId,
  view,
  mode,
  startDate,
  endDate,
  selectedUserId = '',
}) {
  return [userId, view, mode, startDate, endDate, selectedUserId || ''].join('\u001f');
}

export function isDutyScheduleCacheEntry(entry) {
  return Boolean(
    entry
    && typeof entry.key === 'string'
    && typeof entry.userId === 'string'
    && typeof entry.revision === 'string'
    && entry.revision
    && typeof entry.storedAt === 'number'
    && entry.data
    && typeof entry.data === 'object',
  );
}

export function isDutyScheduleCacheFresh(entry, now = Date.now(), ttlMs = DUTY_SCHEDULE_CACHE_TTL_MS) {
  if (!isDutyScheduleCacheEntry(entry)) return false;
  if (now < entry.storedAt) return false;
  return now - entry.storedAt <= ttlMs;
}

/**
 * Decide which Convex subscriptions to run.
 * A fresh cache paints immediately. The revision query stays on while that
 * cache is fresh. The heavy schedule query runs only for a miss, expiry, or
 * a stamp that no longer matches.
 */
export function planDutyScheduleRead({
  enabled,
  checked,
  entry,
  revision,
  now = Date.now(),
}) {
  if (!enabled) {
    return { fetchLive: true, fetchRevision: false, source: 'live' };
  }
  if (!checked) {
    return { fetchLive: false, fetchRevision: false, source: 'pending' };
  }
  const fresh = isDutyScheduleCacheFresh(entry, now);
  if (!fresh) {
    return { fetchLive: true, fetchRevision: false, source: 'live' };
  }
  if (revision === undefined) {
    return { fetchLive: false, fetchRevision: true, source: 'cache' };
  }
  if (String(revision) === String(entry.revision)) {
    return { fetchLive: false, fetchRevision: true, source: 'cache' };
  }
  return { fetchLive: true, fetchRevision: true, source: 'cache-then-live' };
}

export function displayedDutySchedule(plan, live, entry) {
  if (!plan || plan.source === 'pending') return undefined;
  if (live !== undefined) return live;
  if (plan.source === 'cache' || plan.source === 'cache-then-live') return entry?.data;
  return undefined;
}

export function createMemoryDutyScheduleStore() {
  const rows = new Map();
  return {
    async get(key) {
      return rows.has(key) ? rows.get(key) : null;
    },
    async put(entry) {
      rows.set(entry.key, entry);
    },
    async delete(key) {
      rows.delete(key);
    },
    async entries() {
      return [...rows.values()];
    },
  };
}

export async function readDutyScheduleEntry(store, key, now = Date.now()) {
  const entry = await store.get(key);
  const userId = String(key || '').split('\u001f')[0] || '';
  const rows = await store.entries();
  await Promise.all(
    rows
      .filter((row) => row.key !== key && (row.userId !== userId || !isDutyScheduleCacheFresh(row, now)))
      .map((row) => store.delete(row.key)),
  );
  if (!isDutyScheduleCacheFresh(entry, now)) {
    if (entry) await store.delete(key);
    return null;
  }
  return entry;
}

export async function writeDutyScheduleEntry(store, entry, now = Date.now()) {
  if (!isDutyScheduleCacheEntry({ ...entry, storedAt: entry.storedAt ?? now })) return null;
  const stamped = { ...entry, storedAt: entry.storedAt ?? now };
  await store.put(stamped);
  const rows = await store.entries();
  await Promise.all(
    rows
      .filter((row) => row.key !== stamped.key && (
        row.userId !== stamped.userId || !isDutyScheduleCacheFresh(row, now)
      ))
      .map((row) => store.delete(row.key)),
  );
  return stamped;
}

function parseVnLocalMs(date, time) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  const [hour, minute] = String(time || '00:00').split(':').map(Number);
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0, 0) - VN_OFFSET_MS;
}

/** Mirrors `dutyTiming` in convex/duties.ts so a cached calendar does not keep yesterday's ongoing/overdue flags. */
export function dutyEventTiming(event, now = Date.now()) {
  const start = parseVnLocalMs(event?.startDate, event?.startTime || '00:00');
  const end = parseVnLocalMs(event?.endDate, event?.endTime || '00:00');
  const isOngoing = now >= start && now <= end;
  const isOverdue = now > end;
  const isUpcoming = now < start;
  const msToEnd = end - now;
  const nearDeadline = isUpcoming && msToEnd >= 0 && msToEnd <= 24 * 60 * 60 * 1000;
  return { isOngoing, isOverdue, isUpcoming, nearDeadline };
}

export function refreshCachedDutyCalendar(data, now = Date.now()) {
  if (!data || !Array.isArray(data.events)) return data;
  let changed = false;
  const events = data.events.map((event) => {
    const timing = dutyEventTiming(event, now);
    const canMarkAttendance = event?.canMarkSelectedUser === true && timing.isOngoing;
    const previous = event?.timing || {};
    if (
      previous.isOngoing === timing.isOngoing
      && previous.isOverdue === timing.isOverdue
      && previous.isUpcoming === timing.isUpcoming
      && previous.nearDeadline === timing.nearDeadline
      && event.canMarkAttendance === canMarkAttendance
    ) {
      return event;
    }
    changed = true;
    return { ...event, timing, canMarkAttendance };
  });
  return changed ? { ...data, events } : data;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IDB_REQUEST_FAILED'));
  });
}

function openDutyScheduleDb() {
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IDB_OPEN_FAILED'));
  });
}

export function createIdbDutyScheduleStore() {
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = openDutyScheduleDb().catch((error) => {
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  };
  return {
    async get(key) {
      const db = await open();
      if (!db) return null;
      const tx = db.transaction(STORE_NAME, 'readonly');
      return requestToPromise(tx.objectStore(STORE_NAME).get(key));
    },
    async put(entry) {
      const db = await open();
      if (!db) return;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await requestToPromise(tx.objectStore(STORE_NAME).put(entry));
    },
    async delete(key) {
      const db = await open();
      if (!db) return;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await requestToPromise(tx.objectStore(STORE_NAME).delete(key));
    },
    async entries() {
      const db = await open();
      if (!db) return [];
      const tx = db.transaction(STORE_NAME, 'readonly');
      const rows = await requestToPromise(tx.objectStore(STORE_NAME).getAll());
      return Array.isArray(rows) ? rows : [];
    },
  };
}

let browserStore;

function getBrowserStore() {
  if (!browserStore) browserStore = createIdbDutyScheduleStore();
  return browserStore;
}

export async function readBrowserDutyScheduleCache(key, now = Date.now()) {
  try {
    return await readDutyScheduleEntry(getBrowserStore(), key, now);
  } catch {
    return null;
  }
}

export async function writeBrowserDutyScheduleCache(entry, now = Date.now()) {
  try {
    return await writeDutyScheduleEntry(getBrowserStore(), entry, now);
  } catch {
    return null;
  }
}
