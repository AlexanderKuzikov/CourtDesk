#!/usr/bin/env node
/**
 * CourtDesk TUI — pure ANSI, zero UI deps.
 * Весь TUI в одном файле для надёжности.
 */

import * as readline from 'readline';
import type { WatchedCase, DashboardStatus } from '../core/types.js';

// ── ANSI ────────────────────────────────────────────
const ESC = '\x1b';
const A = {
  reset:  `${ESC}[0m`,  rev: `${ESC}[7m`,  bold: `${ESC}[1m`,
  dim:    `${ESC}[2m`,  cls: `${ESC}[2J`,  home: `${ESC}[H`,
  alt1:   `${ESC}[?1049h`, alt0: `${ESC}[?1049l`,
  hide:   `${ESC}[?25l`, show: `${ESC}[?25h`,
  cyan:   `${ESC}[36m`, yellow: `${ESC}[33m`,
  red:    `${ESC}[31m`, green: `${ESC}[32m`, gray: `${ESC}[90m`,
};
const wr = (s: string) => process.stdout.write(s);
const at = (r: number, c = 1) => `${ESC}[${r};${c}H`;
const eol = `${ESC}[2K`;   // erase line
const C = () => process.stdout.columns || 80;
const R = () => process.stdout.rows    || 24;

// ── API ─────────────────────────────────────────────
const API = 'http://127.0.0.1:8767/api';
async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  const j = await r.json();
  if (!j.success) throw new Error(j.error ?? 'API error');
  return j.data as T;
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error ?? 'API error');
  return j.data as T;
}
async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${API}${path}`, { method: 'DELETE' });
  const j = await r.json();
  if (!j.success) throw new Error(j.error ?? 'API error');
}

// ── Форматтеры ─────────────────────────────────────
const STATUS_RU: Record<string, string> = {
  waiting:'Ожидание', monitoring:'Мониторинг', decision:'Решено',
  enforced:'В силе', archived:'Архив', error:'Ошибка',
};
const STATUS_COLOR: Record<string, string> = {
  waiting:'yellow', monitoring:'cyan', decision:'green',
  enforced:'green', archived:'gray', error:'red',
};

function fmtDate(iso: string|null|undefined): string {
  if (!iso) return '—';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(iso)) return iso;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU');
}
function fmtDT(iso: string|null|undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function pad(s: string, w: number): string {
  const t = s ?? '—';
  return t.length > w ? t.slice(0,w-1)+'…' : t+' '.repeat(w-t.length);
}
function vlen(s: string): number { return s.replace(/\x1b\[[0-9;]*m/g,'').length; }
function cw() {
  const t = C();
  return {
    num: Math.min(26,Math.floor(t*0.22)),
    status: Math.min(14,Math.floor(t*0.14)),
    court: Math.min(32,Math.floor(t*0.28)),
    result: Math.max(10,t-Math.floor(t*0.22)-Math.floor(t*0.14)-Math.floor(t*0.28)-5),
  };
}
function wrap(s: string, w: number, indent: string): string[] {
  if (!s) return ['—'];
  const out: string[] = [];
  let r = s;
  while (r.length) {
    out.push(out.length ? indent+r.slice(0,w) : r.slice(0,w));
    r = r.slice(w);
  }
  return out;
}
function ansiColor(name: string): string {
  return ({yellow:A.yellow, cyan:A.cyan, green:A.green, red:A.red, gray:A.dim})[name] ?? '';
}

// ── Состояние ──────────────────────────────────────
type TabId = 'cases' | 'run';
type View = 'list' | 'detail' | 'add';

let cases: WatchedCase[] = [];
let stats: DashboardStatus | null = null;
let tab: TabId = 'cases';
let view: View = 'list';
let cur = 0, vtop = 0, dsc = 0;
let runLog: string[] = [];
let runBusy = false;
let filter = '';
let dead = false;
let timer: ReturnType<typeof setInterval> | null = null;

// ── Загрузка ────────────────────────────────────────
async function load() {
  try { cases = await apiGet<WatchedCase[]>('/cases'); } catch {}
  try { stats = await apiGet<DashboardStatus>('/status'); } catch {}
  if (cur >= cases.length) cur = Math.max(0, cases.length-1);
  render();
}
function refresh() { load().catch(() => render()); }

// ── Рендер ─────────────────────────────────────────
function statusLabel(s: string): string {
  const col = ansiColor(STATUS_COLOR[s] ?? '');
  return col + (STATUS_RU[s] ?? s) + A.reset;
}

function drawHeader() {
  const errN = cases.filter(c=>c.status==='error').length;
  const h = ` CourtDesk `;
  const tabs = [
    tab==='cases' ? A.rev + A.bold + ` ДЕЛА (${cases.length}) ` + A.reset : ` ДЕЛА (${cases.length}) `,
    tab==='run'   ? A.rev + A.bold + ` ЗАПУСК ` + A.reset : ` ЗАПУСК `,
  ];
  wr(at(1)+eol+A.bold+h+tabs.join(' ')+A.reset);
  // stats line
  let sline = `  Дел:${cases.length}`;
  if (errN) sline += A.red+` Ош:${errN}`+A.reset;
  if (stats) sline += A.dim+` │ M:${stats.monitoring} W:${stats.waiting} D:${stats.decision}`+A.reset;
  wr(at(1)+eol+A.bold+h+tabs.join(' ')+A.reset);
  // подсказка справа
  const hint = `[1:Дела 2:Запуск a:Добавить ${tab==='cases'?'q:Выход':'1:Дела'}]`;
  wr(at(1)+`${ESC}[${C()-vlen(hint)+1}G`+A.dim+hint+A.reset);
}

function drawStatus() {
  const r = R();
  const health = !stats ? '—' : stats.health==='ok' ? '✓' : stats.health==='degraded' ? '⚠' : '✗';
  const hc = !stats ? '' : stats.health==='ok' ? A.green : stats.health==='degraded' ? A.yellow : A.red;
  const line = A.dim+`────────────────────────────────────────────────────────────────`+A.reset;
  const info = `${hc}${health}${A.reset}  ${A.dim}[${tab}]${A.reset}`;
  wr(at(r-1)+eol+line);
  wr(at(r)+eol+`${line} ${info}`);
}

function renderList() {
  const q = cw();
  const fcases = !filter ? cases : cases.filter(c =>
    c.number.toLowerCase().includes(filter) ||
    (c.courtId??'').toLowerCase().includes(filter) ||
    ((c as any).courtName??'').toLowerCase().includes(filter)
  );
  const lh = R() - 4; // header(1) + thead(1) + status(2)
  if (cur < vtop) vtop = cur;
  if (cur >= vtop+lh) vtop = cur-lh+1;
  if (vtop > Math.max(0,fcases.length-lh)) vtop = Math.max(0,fcases.length-lh);

  // thead
  wr(at(2)+eol+A.dim+A.bold+
    ` ${pad('№ ДЕЛА',q.num)} ${pad('СТАТУС',q.status)} ${pad('СУД',q.court)} ${pad('РЕШЕНИЕ',q.result)}`+A.reset);

  // список
  for (let i=0; i<lh; i++) {
    wr(at(3+i)+eol);
    const idx = vtop+i;
    if (idx < fcases.length) {
      const c = fcases[idx];
      const cn = (c as any).courtName || c.courtId || '—';
      const line = ` ${pad(c.number||'—',q.num)} ${pad(STATUS_RU[c.status]||c.status,q.status)} ${pad(cn,q.court)} ${pad(c.result||'—',q.result)}`;
      if (idx === cur) wr(A.rev+A.bold+line+A.reset);
      else if (c.status === 'error') wr(A.red+line+A.reset);
      else if (c.status === 'decision' || c.status === 'enforced') wr(A.green+line+A.reset);
      else wr(line);
    }
  }
  // скроллбар
  if (fcases.length > lh) {
    const pct = vtop / Math.max(1,fcases.length-lh);
    const tp = Math.round(pct*(lh-1));
    for (let i=0; i<lh; i++)
      wr(at(3+i)+`${ESC}[${C()}G`+(i===tp ? A.rev+' '+A.reset : A.dim+'│'+A.reset));
  }
  // фильтр
  if (filter)
    wr(at(R()-3)+eol+A.dim+`  Фильтр: ${filter}  [Esc сброс] Найдено ${fcases.length} из ${cases.length}`+A.reset);
}

function buildDetail(c: WatchedCase): string[] {
  const W = C();
  const lines: string[] = [];
  const cn = (c as any).courtName || c.courtId || '—';
  lines.push(`${A.cyan}${A.bold}═ ${c.number||'—'} ${'═'.repeat(Math.max(2,W-4-(c.number||'—').length))}${A.reset}`);
  lines.push(`  ${cn}`);
  lines.push(`  ${statusLabel(c.status||'')}`);
  lines.push(A.dim+'─'.repeat(W)+A.reset);

  function add(lbl: string, val: string, color?: string) {
    const ind = ' '.repeat(24);
    const vw = W-28;
    const v = wrap(val||'—', vw, ind);
    const label = ('  '+lbl+':').padEnd(26);
    lines.push(label+' '+(color?color+v[0]+A.reset:v[0]));
    for (let i=1;i<v.length;i++) lines.push(v[i]);
  }
  add('Результат', c.result||'—');
  add('Вступило в силу', fmtDate(c.legalForceDate));
  add('Добавлено', fmtDate(c.createdAt));
  add('Посл. проверка', fmtDT(c.lastChecked));
  if (c.errorCount) add('Ошибок подряд', String(c.errorCount), A.red);
  if (c.lastError) {
    lines.push(A.dim+'─'.repeat(W)+A.reset);
    lines.push(`  ${A.red}${A.bold}Ошибка:${A.reset}`);
    for (const l of wrap(c.lastError, W-4, '    '))
      lines.push('  '+A.red+l+A.reset);
  }
  if (c.url) {
    lines.push(A.dim+'─'.repeat(W)+A.reset);
    for (const l of wrap(c.url, W-2, '  '))
      lines.push('  '+A.dim+l+A.reset);
  }
  return lines;
}

function renderDetail() {
  const c = cases[cur];
  if (!c) { view='list'; render(); return; }
  const dl = buildDetail(c);
  const vis = R()-2;
  const max = Math.max(0, dl.length-vis);
  if (dsc > max) dsc = max;
  for (let i=0; i<vis; i++) {
    wr(at(2+i)+eol);
    const li = dsc+i;
    if (li < dl.length) wr(dl[li]);
  }
  if (dl.length > vis) {
    const tp = Math.round((dsc/Math.max(1,max))*(vis-1));
    for (let i=0; i<vis; i++)
      wr(at(2+i)+`${ESC}[${C()}G`+(i===tp?A.rev+' '+A.reset:A.dim+'│'+A.reset));
  }
  drawStatus();
  wr(at(R())+eol+A.dim+`↑↓:скролл Esc/q:назад [дело ${cur+1} из ${cases.length}]`+A.reset);
}

function renderRun() {
  const br = 3;
  wr(at(br)+eol+A.bold+'  ЗАПУСК МОНИТОРИНГА'+A.reset+(runBusy?`  ${A.yellow}⧗ выполняется...`+A.reset:''));
  wr(at(br+1)+eol);
  wr(at(br+2)+eol+`  ${runBusy?A.dim:A.yellow}F4 / f${A.reset}  — Полный прогон (все дела)`);
  wr(at(br+3)+eol+`  ${runBusy?A.dim:A.yellow}F5 / r${A.reset}  — Retry (только ошибочные)`);
  wr(at(br+4)+eol+`  ${runBusy?A.dim:A.yellow}F6 / n${A.reset}  — Новые дела (waiting)`);
  wr(at(br+5)+eol);
  const logH = R()-br-7;
  const visLog = runLog.slice(-logH);
  for (let i=0; i<logH; i++) {
    wr(at(br+6+i)+eol);
    if (i < visLog.length) wr('  '+A.dim+visLog[i]+A.reset);
  }
  drawStatus();
  wr(at(R())+eol+A.dim+(runBusy?'[выполняется]':'F4/f F5/r F6/n 1:Дела q:Выход')+A.reset);
}

function renderAdd() {
  // заглушка — через API
}

function render() {
  if (dead) return;
  wr(A.hide);
  if (view === 'detail') { renderDetail(); wr(A.show); return; }
  drawHeader();
  drawStatus();
  if (tab === 'cases') renderList();
  else renderRun();
  wr(A.show);
}

// ── Клавиатура ──────────────────────────────────────
function onKey(str: string, k: readline.Key) {
  const nm = k.name;
  if (k.ctrl && (nm==='c'||nm==='d')) return quit();
  if (str === 'q' || str === 'й') return quit();

  if (view === 'detail') {
    const c = cases[cur];
    const max = c ? Math.max(0,buildDetail(c).length-(R()-2)) : 0;
    if (nm==='up')      { dsc=Math.max(0,dsc-1); render(); return; }
    if (nm==='down')    { dsc=Math.min(max,dsc+1); render(); return; }
    if (nm==='pageup')  { dsc=Math.max(0,dsc-(R()-4)); render(); return; }
    if (nm==='pagedown'){ dsc=Math.min(max,dsc+(R()-4)); render(); return; }
    if (nm==='escape'||nm==='q'||str==='q'||str==='й'){ view='list'; render(); return; }
    return;
  }

  if (str==='1'||nm==='left')  { tab='cases'; view='list'; render(); return; }
  if (str==='2'||nm==='right') { tab='run'; view='list'; render(); return; }

  if (tab === 'cases') {
    if (nm==='up')      { cur=Math.max(0,cur-1); render(); return; }
    if (nm==='down')    { cur=Math.min(cases.length-1,cur+1); render(); return; }
    if (nm==='pageup')  { cur=Math.max(0,cur-(R()-4)); render(); return; }
    if (nm==='pagedown'){ cur=Math.min(cases.length-1,cur+(R()-4)); render(); return; }
    if (nm==='home')    { cur=0; vtop=0; render(); return; }
    if (nm==='end')     { cur=Math.max(0,cases.length-1); render(); return; }
    if (nm==='return'||nm==='enter') { if(cases.length){view='detail';dsc=0;render();} return; }
    if (str==='/'||str==='и') {
      // простой фильтр
      if (!filter) { filter=''; render(); return; }
    }
    if (str==='a'||str==='ф') { /* add placeholder */ return; }
    if (str==='r'||str==='к') { load().catch(()=>{}); return; }
    if (nm==='delete') { /* delete placeholder */ return; }
  }

  if (tab === 'run') {
    if (runBusy) return;
    const keyName = (k as any).name;
    if (keyName==='f4'||str==='f') { doRun('full'); return; }
    if (keyName==='f5'||str==='r'||str==='к') { doRun('retry'); return; }
    if (keyName==='f6'||str==='n'||str==='т') { doRun('new'); return; }
  }
}

async function doRun(mode: string) {
  if (runBusy) return;
  runBusy = true;
  const ts = fmtDT(new Date().toISOString());
  runLog.push(`${ts}  → ${mode}`);
  render();
  try {
    await apiPost('/parse/run', { mode });
    runLog.push(`${fmtDT(new Date().toISOString())}  ✓ ${mode}`);
    await load();
  } catch (e: any) {
    runLog.push(`${fmtDT(new Date().toISOString())}  ✗ ${e.message}`);
  }
  runBusy = false;
  render();
}

// ── Запуск / выход ──────────────────────────────────
function quit() {
  if (dead) return;
  dead = true;
  if (timer) { clearInterval(timer); timer=null; }
  wr(A.show+A.alt0);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

process.on('SIGINT', quit);
process.on('SIGTERM', quit);
process.on('exit', () => { try { wr(A.show+A.alt0); } catch {} });
process.stdout.on('resize', () => { wr(A.cls+A.home); render(); });

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('TUI требует терминала.');
  process.exit(1);
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
readline.emitKeypressEvents(process.stdin);
process.stdin.on('keypress', onKey);

wr(A.alt1+A.cls+A.home);
render();
refresh();
timer = setInterval(refresh, 60_000);
