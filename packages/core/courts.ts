// Справочник судов РФ — унифицированная база (CH2 + CSRF + PSP + OKTMO)
// Источник: CourtOktmo/data/unified-courts.json
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CourtInfo, CourtType } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COURTS_PATH = resolve(__dirname, 'data', 'courts.json');

const COURT_TYPE_CODE: Record<string, CourtType> = {
  RS: 'district',
  MS: 'magistrate',
  AS: 'appeal',
  OS: 'appeal',
  VS: 'appeal',
  KAS: 'cassation',
  GV: 'district',
  OV: 'appeal',
  KV: 'district',
  AV: 'appeal',
  KJ: 'appeal',
  AJ: 'appeal',
  AA: 'appeal',
  AO: 'appeal',
};

function inferCourtType(type: string): CourtType {
  return COURT_TYPE_CODE[type] || 'district';
}

function extractSubdomain(website: string): string {
  if (!website) return '';
  const match = website.match(/https?:\/\/([^.]+)\.([^.]+)\.(sudrf|msudrf)\.ru/);
  if (match) {
    const name = match[1];
    const region = match[2];
    if (match[3] === 'msudrf') return `${name}.${region}`;
    return `${name}--${region}`;
  }
  return '';
}

function extractRegion(code: string): string {
  return code.substring(0, 2);
}

interface RawCourtEntry {
  code: string;
  name: string;
  court_type: string;
  address: string;
  website: string;
  phone: string;
  oktmo: string;
  oktmo_method: string;
}

function toCourtInfo(e: RawCourtEntry): CourtInfo {
  return {
    code: e.code,
    name: e.name,
    courtType: inferCourtType(e.court_type),
    subdomain: extractSubdomain(e.website),
    region: extractRegion(e.code),
    address: e.address,
    website: e.website,
    phone: e.phone || '',
    oktmo: e.oktmo || '',
    oktmoMethod: e.oktmo_method || '',
  };
}

const raw = JSON.parse(readFileSync(COURTS_PATH, 'utf-8')) as {
  count: number;
  version: string;
  description: string;
  courts: RawCourtEntry[];
};

const entries = raw.courts;

const bySubdomain = new Map<string, CourtInfo>();
const byCode = new Map<string, CourtInfo>();
for (const e of entries) {
  const info = toCourtInfo(e);
  if (info.subdomain) bySubdomain.set(info.subdomain, info);
  byCode.set(info.code, info);
}

export function findCourtBySubdomain(subdomain: string): CourtInfo | null {
  return bySubdomain.get(subdomain) ?? null;
}

export function findCourtByCode(code: string): CourtInfo | null {
  return byCode.get(code) ?? null;
}

export function findCourtByCodeOrSubdomain(id: string): CourtInfo | null {
  return findCourtByCode(id) ?? findCourtBySubdomain(id);
}

export function findCourtsByName(query: string): CourtInfo[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];
  return entries
    .filter(e => words.every(w => e.name.toLowerCase().includes(w)))
    .map(toCourtInfo)
    .slice(0, 50);
}

export function findCourtsByRegion(region: string): CourtInfo[] {
  return entries.filter(e => e.code.startsWith(region)).map(toCourtInfo);
}

export function getTotalCourts(): number {
  return entries.length;
}

export function getAllCourts(): CourtInfo[] {
  return entries.map(toCourtInfo);
}
