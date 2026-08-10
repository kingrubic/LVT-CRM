import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class DriveUploadStages {
  constructor(filePath) {
    this.filePath = filePath;
    this.records = null;
    this.writeQueue = Promise.resolve();
  }

  async get(token) {
    await this.#load();
    return this.records[token] || null;
  }

  async add(token, record) {
    await this.#load();
    this.records[token] = record;
    await this.#persist();
  }

  async entries() {
    await this.#load();
    return Object.entries(this.records);
  }

  async remove(token) {
    await this.#load();
    if (!this.records[token]) return;
    delete this.records[token];
    await this.#persist();
  }

  async #load() {
    if (this.records) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      this.records = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.records = {};
    }
  }

  async #persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(this.records)}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    });
    await this.writeQueue;
  }
}
