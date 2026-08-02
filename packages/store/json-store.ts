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
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch (err) {
    // Файла нет — норма, отдаём fallback (CR6-001)
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    // Файл есть, но повреждён — бэкапим и падаем
    const corrupt = `${path}.corrupt.${Date.now()}`;
    renameSync(path, corrupt);
    throw new Error(`Corrupt JSON in ${filename}, backed up to ${corrupt}`);
  }
}

function writeJson<T>(filename: string, data: T): void {
  ensureDataDir();
  const filepath = resolve(DATA_DIR, filename);
  // CR12-S06 FIXED: randomUUID вместо Date.now() — нет коллизий при записи в одну мс
  const tmp = filepath + '.tmp.' + crypto.randomUUID();
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmp, filepath);
}

export { DATA_DIR, readJson, writeJson };
