#!/usr/bin/env node
// Convert CRM-INTEGRATION.md → CRM-INTEGRATION.html
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(__dirname, '..', 'docs');

const md = readFileSync(resolve(DOCS, 'CRM-INTEGRATION.md'), 'utf-8');
const title = 'Интеграция CourtDesk с 1С CRM';

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(part) {
  // **bold**
  part = part.replace(/\*\*(.+?)\*\*/g, (_, t) => `<strong>${esc(t)}</strong>`);
  // `code`
  part = part.replace(/`([^`]+)`/g, (_, t) => `<code>${esc(t)}</code>`);
  // [text](url)
  part = part.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${esc(u)}">${esc(t)}</a>`);
  return part;
}

function renderTable(rows) {
  const head = rows[0];
  const body = rows.slice(1);
  let h = '<table>\n<thead>\n<tr>';
  for (const c of head.split('|').slice(1, -1)) h += `<th>${inline(c.trim())}</th>`;
  h += '</tr>\n</thead>\n<tbody>\n';
  for (const row of body) {
    h += '<tr>';
    for (const c of row.split('|').slice(1, -1)) h += `<td>${inline(c.trim())}</td>`;
    h += '</tr>\n';
  }
  h += '</tbody>\n</table>\n';
  return h;
}

const lines = md.split('\n');
const out = [];
let inCode = false;
let codeBuf = [];
let inTable = false;
let tableBuf = [];
let inList = false;
let inBlockquote = false;

function flushCode() {
  if (codeBuf.length) {
    out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>\n');
    codeBuf = [];
  }
}
function flushTable() {
  if (tableBuf.length) {
    out.push(renderTable(tableBuf));
    tableBuf = [];
  }
}
function flushList() {
  if (inList) { out.push('</ul>\n'); inList = false; }
}

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];

  // Code block fences
  if (raw.startsWith('```')) {
    if (inCode) { inCode = false; flushCode(); }
    else { flushTable(); flushList(); inCode = true; codeBuf = []; }
    continue;
  }
  if (inCode) { codeBuf.push(raw); continue; }

  // Skip separator rows in tables (|---|, |---|:---| etc.) — unconditionally
  if (/^\|[\s\-:|]+\|$/.test(raw)) continue;

  // Table detection
  if (raw.startsWith('|') && raw.endsWith('|')) {
    if (!inTable) { flushList(); flushTable(); inTable = true; tableBuf = []; }
    tableBuf.push(raw);
    continue;
  } else {
    if (inTable) { inTable = false; flushTable(); }
  }

  // Horizontal rule
  if (/^---$/.test(raw.trim())) { flushList(); out.push('<hr>\n'); continue; }

  // Headings
  const hm = raw.match(/^(#{1,4})\s+(.+)$/);
  if (hm) {
    flushList();
    const lvl = hm[1].length;
    out.push(`<h${lvl}>${inline(hm[2])}</h${lvl}>\n`);
    continue;
  }

  // Blockquote
  const bqm = raw.match(/^>\s*(.*)$/);
  if (bqm) {
    flushList();
    if (!inBlockquote) { out.push('<blockquote>\n'); inBlockquote = true; }
    const txt = bqm[1].trim();
    if (txt) out.push(`<p>${inline(txt)}</p>\n`);
    continue;
  }
  if (inBlockquote) { out.push('</blockquote>\n'); inBlockquote = false; }

  // Unordered list
  const lm = raw.match(/^[\s]*[-*+]\s+(.+)$/);
  if (lm) {
    if (!inList) { out.push('<ul>\n'); inList = true; }
    out.push(`<li>${inline(lm[1])}</li>\n`);
    continue;
  }
  flushList();

  // Empty line
  if (!raw.trim()) continue;

  // Paragraph
  out.push(`<p>${inline(raw.trim())}</p>\n`);
}

flushCode();
flushTable();
flushList();
if (inBlockquote) out.push('</blockquote>\n');

const body = out.join('');

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  @page { size: A4; margin: 2cm; }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, 'Segoe UI', Roboto, sans-serif;
    font-size: 10.5pt; line-height: 1.6; color: #1e293b;
    max-width: 1000px; margin: 0 auto; padding: 20px 30px;
    background: #fff;
  }
  h1 { font-size: 20pt; color: #0f172a; border-bottom: 3px solid #2563eb; padding-bottom: 6px; margin-top: 32px; }
  h2 { font-size: 15pt; color: #1e293b; margin-top: 28px; }
  h3 { font-size: 12pt; color: #334155; margin-top: 20px; }
  h4 { font-size: 11pt; color: #475569; margin-top: 16px; }
  p  { margin: 6px 0; }
  a  { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  strong { color: #0f172a; }
  code {
    font-family: 'Consolas', 'Cascadia Code', 'JetBrains Mono', monospace;
    font-size: 9pt; background: #f1f5f9; padding: 1px 5px;
    border-radius: 3px; color: #dc2626;
  }
  pre {
    background: #0f172a; color: #e2e8f0; padding: 14px 18px;
    border-radius: 8px; font-size: 9pt; overflow-x: auto;
    line-height: 1.45;
  }
  pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9.5pt; }
  th { background: #1e293b; color: #fff; padding: 6px 10px; text-align: left; font-weight: 600; white-space: nowrap; }
  td { padding: 5px 10px; border: 1px solid #cbd5e1; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  ul, ol { margin: 4px 0 8px; padding-left: 24px; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 2px solid #e2e8f0; margin: 20px 0; }
  .badge { display: inline-block; font-size: 8pt; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .endpoint { font-family: 'Consolas', monospace; font-size: 10pt; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; }
  @media print {
    body { padding: 0; font-size: 9.5pt; }
    pre { page-break-inside: avoid; }
    h2, h3 { break-after: avoid; }
    table { page-break-inside: avoid; }
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #e2e8f0; }
    h1, h2, h3, h4, strong { color: #f1f5f9; }
    code { background: #1e293b; color: #fca5a5; }
    pre { background: #020617; }
    th { background: #334155; }
    td { border-color: #334155; }
    tr:nth-child(even) td { background: #1e293b; }
    hr { border-top-color: #334155; }
    a { color: #60a5fa; }
    .endpoint { background: #1e293b; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;

writeFileSync(resolve(DOCS, 'CRM-INTEGRATION.html'), html, 'utf-8');
console.log(`[html] Created: CRM-INTEGRATION.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
