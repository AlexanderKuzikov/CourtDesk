// JSON-хранилище с атомарной записью (tmp + rename)
import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', '..', 'data');

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(filename: string, fallback: T): T {
  const path = resolve(DATA_DIR, filename);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(filename: string, data: T): void {
  ensureDataDir();
  const filepath = resolve(DATA_DIR, filename);
  const tmp = filepath + '.tmp.' + Date.now();
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmp, filepath);
}

export { DATA_DIR, readJson, writeJson };
