import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DRIVE_CACHE_TTL_MS = DAY_MS;

/** Stable cache/version key: SHA-256 when present, else Drive id+size, else Convex storage id. */
export function workFileVersion(file) {
  if (file?.driveChecksum) return String(file.driveChecksum);
  if (file?.driveFileId) return `${file.driveFileId}:${file.fileSize || ''}`;
  if (file?.storageId) return `convex-storage:${file.storageId}:${file.fileSize || 0}`;
  throw new Error('WORK_FILE_NOT_FOUND');
}

export function workFileCacheIdentity(file) {
  if (file?.driveFileId) return `${file.driveFileId}:${workFileVersion(file)}`;
  if (file?.storageId) return workFileVersion(file);
  throw new Error('WORK_FILE_NOT_FOUND');
}

export class AsyncSemaphore {
  constructor(limit = 8, maxQueue = 500) {
    this.limit = Math.max(1, Number(limit) || 8);
    this.maxQueue = Math.max(this.limit, Number(maxQueue) || 500);
    this.active = 0;
    this.queue = [];
  }

  async run(operation) {
    if (this.active >= this.limit) {
      if (this.queue.length >= this.maxQueue) throw new Error('DRIVE_DOWNLOAD_QUEUE_FULL');
      await new Promise((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

export class DriveFileCache {
  constructor({
    directory,
    ttlMs = DAY_MS,
    maxBytes = 10 * 1024 ** 3,
    now = () => Date.now(),
  }) {
    this.directory = directory;
    this.ttlMs = ttlMs;
    this.maxBytes = maxBytes;
    this.now = now;
    this.inFlight = new Map();
    this.maintenance = Promise.resolve();
  }

  keyFor(sourceIdentity) {
    return createHash('sha256').update(String(sourceIdentity)).digest('hex');
  }

  paths(key) {
    return {
      data: path.join(this.directory, `${key}.data`),
      metadata: path.join(this.directory, `${key}.json`),
    };
  }

  async get(sourceIdentity) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const key = this.keyFor(sourceIdentity);
    const entry = await this.#readValid(key);
    if (!entry) return null;
    await this.#touch(entry).catch(() => {});
    return { ...entry, cacheStatus: 'HIT' };
  }

  async getOrCreate(sourceIdentity, producer) {
    const hit = await this.get(sourceIdentity);
    if (hit) return hit;
    const key = this.keyFor(sourceIdentity);
    const existing = this.inFlight.get(key);
    if (existing) return { ...(await existing), cacheStatus: 'COALESCED' };

    const pending = this.#create(key, String(sourceIdentity), producer).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, pending);
    return { ...(await pending), cacheStatus: 'MISS' };
  }

  async invalidateDriveFile(driveFileId) {
    const prefix = `${String(driveFileId)}:`;
    const names = await readdir(this.directory).catch(() => []);
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      const key = name.slice(0, -5);
      try {
        const metadata = JSON.parse(await readFile(path.join(this.directory, name), 'utf8'));
        if (!metadata.sourceIdentity || String(metadata.sourceIdentity).startsWith(prefix)) {
          await this.#remove(key);
        }
      } catch {
        // Normal cache reads/pruning remove malformed entries.
      }
    }
  }

  async prune() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const names = await readdir(this.directory).catch(() => []);
    const metadataKeys = new Set(names.filter((item) => item.endsWith('.json')).map((item) => item.slice(0, -5)));
    for (const name of names) {
      const orphanData = name.endsWith('.data') && !metadataKeys.has(name.slice(0, -5));
      const temporary = name.startsWith('.') && name.endsWith('.tmp');
      if (!orphanData && !temporary) continue;
      const candidate = path.join(this.directory, name);
      const info = await stat(candidate).catch(() => null);
      if (info && this.now() - info.mtimeMs >= this.ttlMs) {
        await rm(candidate, { force: true });
      }
    }
    const entries = [];
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      const key = name.slice(0, -5);
      const entry = await this.#readValid(key, { removeExpired: true });
      if (entry) entries.push(entry);
    }
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    for (const entry of entries) {
      if (total <= this.maxBytes) break;
      await this.#remove(entry.key);
      total -= entry.size;
    }
    return { entries: entries.length, bytes: Math.max(0, total) };
  }

  async #create(key, sourceIdentity, producer) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const finalPaths = this.paths(key);
    const temporary = path.join(this.directory, `.${key}.${randomUUID()}.tmp`);
    try {
      await producer(temporary);
      const info = await stat(temporary);
      if (!info.isFile() || info.size <= 0) throw new Error('DRIVE_DOWNLOAD_EMPTY');
      const now = this.now();
      const metadata = {
        key,
        sourceIdentity,
        size: info.size,
        createdAt: now,
        lastAccessedAt: now,
      };
      await rename(temporary, finalPaths.data);
      await this.#writeMetadata(finalPaths.metadata, metadata);
      const entry = { ...metadata, path: finalPaths.data, etag: `"${key}"` };
      this.#schedulePrune();
      return entry;
    } catch (error) {
      await rm(temporary, { force: true });
      await this.#remove(key);
      throw error;
    }
  }

  async #readValid(key, { removeExpired = true } = {}) {
    const paths = this.paths(key);
    try {
      const [raw, dataInfo] = await Promise.all([readFile(paths.metadata, 'utf8'), stat(paths.data)]);
      const metadata = JSON.parse(raw);
      const expired = !Number.isFinite(metadata.createdAt) || this.now() - metadata.createdAt >= this.ttlMs;
      const invalid = metadata.key !== key || !dataInfo.isFile() || dataInfo.size <= 0 || dataInfo.size !== metadata.size;
      if (expired || invalid) {
        if (removeExpired) await this.#remove(key);
        return null;
      }
      return { ...metadata, path: paths.data, etag: `"${key}"` };
    } catch {
      if (removeExpired) await this.#remove(key);
      return null;
    }
  }

  async #touch(entry) {
    entry.lastAccessedAt = this.now();
    await this.#writeMetadata(this.paths(entry.key).metadata, {
      key: entry.key,
      sourceIdentity: entry.sourceIdentity,
      size: entry.size,
      createdAt: entry.createdAt,
      lastAccessedAt: entry.lastAccessedAt,
    });
  }

  async #writeMetadata(destination, metadata) {
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'w', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(metadata)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async #remove(key) {
    const paths = this.paths(key);
    await Promise.all([rm(paths.data, { force: true }), rm(paths.metadata, { force: true })]);
  }

  #schedulePrune() {
    this.maintenance = this.maintenance.then(() => this.prune()).catch(() => {});
  }
}
