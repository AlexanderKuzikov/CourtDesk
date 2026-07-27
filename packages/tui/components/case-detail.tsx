import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WatchedCase, CaseEvent } from '../types.js';
import { getCaseEvents } from '../api.js';

interface CaseDetailProps {
  c: WatchedCase;
  onBack: () => void;
}

const STATUS_RU: Record<string, string> = {
  waiting:    'Ожидание',
  monitoring: 'Мониторинг',
  decision:   'Решение вынесено',
  enforced:   'Вступило в силу',
  archived:   'Архив',
  error:      'Ошибка',
};

const STATUS_COLOR: Record<string, string> = {
  waiting:    'yellow',
  monitoring: 'cyan',
  decision:   'green',
  enforced:   'green',
  archived:   'gray',
  error:      'red',
};

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CaseDetail({ c, onBack }: CaseDetailProps) {
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [scroll, setScroll] = useState(0);
  const courtName = (c as any).courtName || c.courtId || '—';
  const statusColor = STATUS_COLOR[c.status] || undefined;
  const statusLabel = STATUS_RU[c.status] || c.status;

  useInput((_input, key) => {
    if (key.escape || key.return) { onBack(); return; }
    if (key.upArrow) { setScroll(s => Math.max(0, s - 1)); return; }
    if (key.downArrow) { setScroll(s => s + 1); return; }
    if (key.pageUp) { setScroll(s => Math.max(0, s - 10)); return; }
    if (key.pageDown) { setScroll(s => s + 10); return; }
  });

  useEffect(() => {
    getCaseEvents(c.uid).then(setEvents).catch(() => {});
  }, [c.uid]);

  const lines: string[] = [];

  // Header
  lines.push(`═ ${c.number || '—'} ═`);
  lines.push(`  ${courtName}`);
  lines.push(`  ${statusLabel}`);

  // Fields
  const fields: [string, string][] = [
    ['Результат', c.result || '—'],
    ['Вступило в силу', fmtDate(c.legalForceDate)],
    ['Добавлено', fmtDate(c.createdAt)],
    ['Посл. проверка', fmtDateTime(c.lastChecked)],
  ];
  if (c.errorCount) fields.push(['Ошибок подряд', String(c.errorCount)]);
  for (const [k, v] of fields) lines.push(`  ${k}: ${v}`);

  if (c.lastError) {
    lines.push('');
    lines.push(`  Ошибка: ${c.lastError}`);
  }

  if (c.url) {
    lines.push('');
    lines.push(`  URL: ${c.url}`);
  }

  // Events timeline
  if (events.length) {
    lines.push('');
    lines.push('  ─ События ─');
    for (const e of events) {
      lines.push(`  ${fmtDateTime(e.createdAt)}  ${e.message}`);
    }
  }

  const viewHeight = 15; // approximate
  const maxScroll = Math.max(0, lines.length - viewHeight);
  const safeScroll = Math.min(scroll, maxScroll);
  const shown = lines.slice(safeScroll, safeScroll + viewHeight);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text dimColor>[Esc/Enter — назад]</Text>
      <Box flexDirection="column" marginTop={1}>
        {shown.map((l, i) => (
          <Text key={i} wrap="truncate-end">{l}</Text>
        ))}
      </Box>
      {lines.length > viewHeight && (
        <Box marginTop={1}>
          <Text dimColor>↑↓ скролл  ({safeScroll + 1}–{Math.min(safeScroll + viewHeight, lines.length)} из {lines.length})</Text>
        </Box>
      )}
    </Box>
  );
}
