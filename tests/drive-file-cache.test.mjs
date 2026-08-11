import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AsyncSemaphore, DriveFileCache } from '../scripts/lib/drive-file-cache.mjs';

async function tempDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'lvt-drive-cache-test-'));
}

test('Drive cache persists one atomic non-empty entry and reuses it', async () => {
  const directory = await tempDirectory();
  let produced = 0;
  const cache = new DriveFileCache({ directory, maxBytes: 1024 });
  const first = await cache.getOrCreate('drive-1:v1', async (destination) => {
    produced += 1;
    await writeFile(destination, 'document');
  });
  const second = await cache.getOrCreate('drive-1:v1', async () => { produced += 1; });
  assert.equal(produced, 1);
  assert.equal(first.cacheStatus, 'MISS');
  assert.equal(second.cacheStatus, 'HIT');
  assert.equal(await readFile(second.path, 'utf8'), 'document');
  assert.equal((await readdir(directory)).filter((name) => name.endsWith('.tmp')).length, 0);
  await cache.invalidateDriveFile('drive-1');
  assert.equal(await cache.get('drive-1:v1'), null);
});

test('Drive cache single-flight coalesces concurrent misses', async () => {
  const directory = await tempDirectory();
  const cache = new DriveFileCache({ directory });
  let produced = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const requests = Array.from({ length: 50 }, () => cache.getOrCreate('same-file', async (destination) => {
    produced += 1;
    await gate;
    await writeFile(destination, 'shared');
  }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  release();
  const entries = await Promise.all(requests);
  assert.equal(produced, 1);
  assert.equal(entries.filter((entry) => entry.cacheStatus === 'MISS').length, 1);
  assert.equal(entries.filter((entry) => entry.cacheStatus === 'COALESCED').length, 49);
});

test('Drive cache rejects partial files and expires entries', async () => {
  const directory = await tempDirectory();
  let now = 1000;
  const cache = new DriveFileCache({ directory, ttlMs: 100, now: () => now });
  await assert.rejects(cache.getOrCreate('empty', (destination) => writeFile(destination, '')), /EMPTY/);
  assert.equal((await readdir(directory)).filter((name) => name.endsWith('.data')).length, 0);
  await cache.getOrCreate('expiring', (destination) => writeFile(destination, 'valid'));
  now = 1100;
  assert.equal(await cache.get('expiring'), null);
});

test('Drive cache prunes stale orphan/temp files and least recently used entries', async () => {
  const directory = await tempDirectory();
  let now = 2 * 24 * 60 * 60 * 1000;
  const cache = new DriveFileCache({ directory, maxBytes: 7, now: () => now });
  const orphan = path.join(directory, 'orphan.data');
  const temporary = path.join(directory, '.interrupted.tmp');
  await writeFile(orphan, 'orphan');
  await writeFile(temporary, 'temporary');
  await utimes(orphan, new Date(0), new Date(0));
  await utimes(temporary, new Date(0), new Date(0));
  await cache.prune();
  await assert.rejects(stat(orphan));
  await assert.rejects(stat(temporary));

  now += 1;
  await cache.getOrCreate('old', (destination) => writeFile(destination, '12345'));
  await cache.maintenance;
  now += 10;
  await cache.getOrCreate('new', (destination) => writeFile(destination, '67890'));
  await cache.maintenance;
  assert.equal(await cache.get('old'), null);
  assert.equal((await cache.get('new'))?.size, 5);
});

test('Drive download semaphore enforces concurrency and queue bound', async () => {
  const semaphore = new AsyncSemaphore(2, 3);
  let active = 0;
  let maximum = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const jobs = Array.from({ length: 5 }, () => semaphore.run(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await gate;
    active -= 1;
  }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await assert.rejects(semaphore.run(async () => {}), /QUEUE_FULL/);
  release();
  await Promise.all(jobs);
  assert.equal(maximum, 2);
});
