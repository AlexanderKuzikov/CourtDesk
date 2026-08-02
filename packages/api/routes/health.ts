import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();

// CR11-008 FIXED: версия берётся из package.json, а не хардкодится
function readVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(dir, '..', '..', '..', 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = readVersion();

router.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', version: VERSION } });
});

export default router;