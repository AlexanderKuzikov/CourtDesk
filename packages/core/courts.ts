// Справочник судов РФ — унифицированная база (CH2 + CSRF + PSP + OKTMO)
// Источник: CourtOktmo/data/unified-courts.json
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CourtInfo, CourtType } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COURTS_PATH = resolve(__dirname, 'data', 'courts.json');
const HIERARCHY_PATH = resolve(__dirname, 'data', 'court-hierarchy.json');

// Иерархия судов: буквенный код → буквенный код вышестоящего
const COURT_HIERARCHY: Record<string, string> = {
  MS: 'RS',  // мировой → районный
  RS: 'OS',  // районный → областной
  OS: 'KJ',  // областной → кассационный
};

// Регион → код кассационного суда
const CASSATION_MAP: Record<string, string> = {
  '01': '23KJ0004', '08': '23KJ0004', '23': '23KJ0004', '30': '23KJ0004',
  '34': '23KJ0004', '61': '23KJ0004', '91': '23KJ0004', '92': '23KJ0004',
  '05': '26KJ0005', '06': '26KJ0005', '07': '26KJ0005', '09': '26KJ0005',
  '15': '26KJ0005', '20': '26KJ0005', '26': '26KJ0005',
  '10': '78KJ0003', '11': '78KJ0003', '29': '78KJ0003', '35': '78KJ0003',
  '39': '78KJ0003', '47': '78KJ0003', '51': '78KJ0003', '53': '78KJ0003',
  '60': '78KJ0003', '78': '78KJ0003', '83': '78KJ0003',
  '02': '42KJ0008', '04': '42KJ0008', '17': '42KJ0008', '19': '42KJ0008',
  '22': '42KJ0008', '24': '42KJ0008', '38': '42KJ0008', '42': '42KJ0008',
  '54': '42KJ0008', '55': '42KJ0008', '70': '42KJ0008', '75': '42KJ0008',
  '45': '74KJ0007', '59': '74KJ0007', '66': '74KJ0007', '72': '74KJ0007',
  '74': '74KJ0007', '86': '74KJ0007', '89': '74KJ0007',
  '13': '64KJ0001', '31': '64KJ0001', '32': '64KJ0001', '36': '64KJ0001',
  '40': '64KJ0001', '46': '64KJ0001', '48': '64KJ0001', '50': '64KJ0001',
  '52': '64KJ0001', '57': '64KJ0001', '58': '64KJ0001', '64': '64KJ0001',
  '71': '64KJ0001',
  '33': '77KJ0002', '37': '77KJ0002', '44': '77KJ0002', '62': '77KJ0002',
  '67': '77KJ0002', '68': '77KJ0002', '69': '77KJ0002', '76': '77KJ0002',
  '77': '77KJ0002', '90': '77KJ0002', '93': '77KJ0002', '94': '77KJ0002',
  '96': '77KJ0002',
  '03': '63KJ0006', '12': '63KJ0006', '16': '63KJ0006', '18': '63KJ0006',
  '21': '63KJ0006', '43': '63KJ0006', '56': '63KJ0006', '63': '63KJ0006',
  '73': '63KJ0006',
  '14': '25KJ0009', '25': '25KJ0009', '27': '25KJ0009', '28': '25KJ0009',
  '41': '25KJ0009', '49': '25KJ0009', '65': '25KJ0009', '79': '25KJ0009',
  '87': '25KJ0009',
};

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

export function extractRegion(code: string): string {
  return code.substring(0, 2);
}

function extractCourtTypeCode(code: string): string {
  return code.length >= 4 ? code.substring(2, 4) : '';
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

let _hierarchyCache: Record<string, string> | null = null;

function loadHierarchyCache(): Record<string, string> {
  if (_hierarchyCache) return _hierarchyCache;
  try {
    if (existsSync(HIERARCHY_PATH)) {
      _hierarchyCache = JSON.parse(readFileSync(HIERARCHY_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  _hierarchyCache = _hierarchyCache ?? {};
  return _hierarchyCache;
}

function saveHierarchyCache(): void {
  if (_hierarchyCache) {
    writeFileSync(HIERARCHY_PATH, JSON.stringify(_hierarchyCache, null, 2), 'utf-8');
  }
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
    .slice(0, 50)
    .map(toCourtInfo);
}

export function findCourtsByRegion(region: string): CourtInfo[] {
  return entries.filter(e => e.code.startsWith(region)).slice(0, 50).map(toCourtInfo);
}

export function getTotalCourts(): number {
  return entries.length;
}

export function getAllCourts(): CourtInfo[] {
  return Array.from(byCode.values());
}

/** Получить вышестоящий суд по коду суда */
export function findHigherCourt(courtCode: string): CourtInfo | null {
  const type = extractCourtTypeCode(courtCode);
  const region = extractRegion(courtCode);
  const higherType = COURT_HIERARCHY[type];
  if (!higherType) return null;

  // MS → RS: из кэша или по региону
  if (type === 'MS') {
    const cache = loadHierarchyCache();
    const cached = cache[courtCode];
    if (cached) {
      const found = findCourtByCode(cached);
      if (found) return found;
    }
    // Возвращаем null — caller будет перебирать кандидатов
    return null;
  }

  // RS → OS: 59RS0001 → 59OS0000
  if (type === 'RS' && higherType === 'OS') {
    return findCourtByCode(`${region}${higherType}0000`);
  }

  // OS → KJ: по карте регионов
  if (type === 'OS' && higherType === 'KJ') {
    const cassCode = CASSATION_MAP[region];
    return cassCode ? findCourtByCode(cassCode) : null;
  }

  return null;
}

/** Получить всех кандидатов в районные суды для мирового (MS) */
export function findRsCandidatesForMs(courtCode: string): CourtInfo[] {
  const region = extractRegion(courtCode);
  return findCourtsByRegion(region).filter(c => c.courtType === 'district');
}

/** Сохранить найденную привязку MS → RS */
export function saveMsToRsMapping(msCode: string, rsCode: string): void {
  const cache = loadHierarchyCache();
  cache[msCode] = rsCode;
  _hierarchyCache = cache;
  saveHierarchyCache();
}
