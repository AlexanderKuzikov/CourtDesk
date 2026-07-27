import React, { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { WatchedCase } from '../types.js';

interface CaseListProps {
  cases: WatchedCase[];
  selected: number;
  onSelect: (idx: number) => void;
  onEnter: () => void;
  onDelete: (uid: string) => void;
}

const STATUS_RU: Record<string, string> = {
  waiting:    'Ожидание  ',
  monitoring: 'Мониторинг',
  decision:   'Решено    ',
  enforced:   'В силе    ',
  archived:   'Архив     ',
  error:      'Ошибка    ',
};

// Строка целиком — собирается как одна строка, селект = inverse всей строки
function rowText(c: WatchedCase, sel: boolean, w: number): string {
  const courtName = (c as any).courtName || c.courtId || '—';
  // Ширина колонок в символах
  const numW   = Math.min(26, Math.floor(w * 0.22));
  const statW  = Math.min(14, Math.floor(w * 0.14));
  const courtW = Math.min(32, Math.floor(w * 0.28));
  const resW   = Math.max(10, w - numW - statW - courtW - 5);

  const num   = (c.number || '—').padEnd(numW).slice(0, numW);
  const stat  = (STATUS_RU[c.status] || c.status).padEnd(statW).slice(0, statW);
  const court = courtName.padEnd(courtW).slice(0, courtW);
  const result = (c.result || '—').padEnd(resW).slice(0, resW);

  return ` ${num} ${stat} ${court} ${result}`;
}

export default function CaseList({ cases, selected, onSelect, onEnter, onDelete }: CaseListProps) {
  const { stdout } = useStdout();
  const [filter, setFilter] = useState('');
  const [searchMode, setSearchMode] = useState(false);

  const termW = stdout.columns || 80;

  const filtered = useMemo(() => {
    if (!filter) return cases;
    const q = filter.toLowerCase();
    return cases.filter(c =>
      c.number.toLowerCase().includes(q) ||
      c.courtId?.toLowerCase().includes(q) ||
      ((c as any).courtName ?? '').toLowerCase().includes(q)
    );
  }, [cases, filter]);

  // Высота списка = всё что помещается минус 4 строки (таббар, заголовок, статус, футер)
  const listH = Math.max(3, (stdout.rows || 24) - 5);
  const cur = Math.max(0, Math.min(selected, filtered.length - 1));

  // Скролл — держим cur в видимой области
  const maxVtop = Math.max(0, filtered.length - listH);
  const vtop = Math.max(0, Math.min(cur - Math.floor(listH / 2), maxVtop));

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape || key.return) { setSearchMode(false); return; }
      if (key.backspace || key.delete) { setFilter(f => f.slice(0, -1)); return; }
      if (input.length === 1 && !key.ctrl) { setFilter(f => f + input); return; }
      return;
    }
    if (key.upArrow)    { onSelect(Math.max(0, cur - 1)); return; }
    if (key.downArrow)  { onSelect(Math.min(filtered.length - 1, cur + 1)); return; }
    if (key.pageUp)     { onSelect(Math.max(0, cur - listH)); return; }
    if (key.pageDown)   { onSelect(Math.min(filtered.length - 1, cur + listH)); return; }
    if (key.home)       { onSelect(0); return; }
    if (key.end)        { onSelect(Math.max(0, filtered.length - 1)); return; }
    if (key.return)     { if (filtered.length > 0) onEnter(); return; }
    if (input === '/' || input === 'и') { setSearchMode(true); setFilter(''); return; }
    if (key.delete && filtered.length > 0) { onDelete(filtered[cur].uid); return; }
  });

  if (!cases.length) {
    return <Text>  Дел нет. Запустите API: npm start</Text>;
  }

  const shown = filtered.slice(vtop, vtop + listH);
  const totalW = termW;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {searchMode && (
        <Box>
          <Text bold>/</Text>
          <Text>{filter}</Text>
          <Text dimColor>█</Text>
        </Box>
      )}

      {/* Заголовок */}
      <Box paddingLeft={1}>
        <Text dimColor bold>
          {` ${'№ ДЕЛА'.padEnd(Math.min(26, Math.floor(totalW * 0.22)))} ${'СТАТУС'.padEnd(Math.min(14, Math.floor(totalW * 0.14)))} ${'СУД'.padEnd(Math.min(32, Math.floor(totalW * 0.28)))} ${'РЕШЕНИЕ'}`}
        </Text>
      </Box>

      {/* Строки */}
      <Box flexDirection="column" flexGrow={1}>
        {shown.map((c, i) => {
          const idx = vtop + i;
          const sel = idx === cur;
          const text = rowText(c, sel, totalW);

          // Для выбранной строки — inverse, для ошибок — красный
          const statusColor = c.status === 'error' && !sel ? 'red' : undefined;
          return (
            <Box key={c.uid} paddingLeft={1}>
              <Text inverse={sel} color={statusColor} wrap="truncate-end">{text}</Text>
            </Box>
          );
        })}

        {/* Скроллбар */}
        {filtered.length > listH && (
          <Box paddingLeft={1}>
            <Text dimColor>
              {Array.from({ length: listH }, (_, i) => {
                const pct = vtop / Math.max(1, filtered.length - listH);
                const tp = Math.round(pct * (listH - 1));
                return i === tp ? '█' : '│';
              }).join('')}
            </Text>
          </Box>
        )}

        {/* Счётчик */}
        <Box paddingLeft={1} marginTop={1}>
          <Text dimColor>
            {filter ? `Найдено: ${filtered.length} из ${cases.length}` : `Всего: ${cases.length}`}
            {filter && '  [Esc] сброс'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
