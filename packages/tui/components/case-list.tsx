import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WatchedCase } from '../types.js';

interface CaseListProps {
  cases: WatchedCase[];
  selected: number;
  onSelect: (idx: number) => void;
  onEnter: () => void;
  onDelete: (uid: string) => void;
}

const STATUS_RU: Record<string, string> = {
  waiting:    'Ожидание',
  monitoring: 'Мониторинг',
  decision:   'Решено',
  enforced:   'В силе',
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function truncate(s: string, w: number): string {
  if (!s) return '—';
  if (s.length <= w) return s;
  return s.slice(0, w - 1) + '…';
}

interface ColumnWidths {
  num: number;
  status: number;
  court: number;
  result: number;
}

function calcCols(total: number): ColumnWidths {
  const num    = Math.min(26, Math.floor(total * 0.22));
  const status = Math.min(14, Math.floor(total * 0.14));
  const court  = Math.min(32, Math.floor(total * 0.28));
  const result = Math.max(10, total - num - status - court - 8);
  return { num, status, court, result };
}

export default function CaseList({ cases, selected, onSelect, onEnter, onDelete }: CaseListProps) {
  const [filter, setFilter] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [vtop, setVtop] = useState(0);
  const rowsRef = useRef(0);

  const cols = useMemo(() => calcCols(80), []); // will update on render

  const filtered = useMemo(() => {
    if (!filter) return cases;
    const q = filter.toLowerCase();
    return cases.filter(c =>
      c.number.toLowerCase().includes(q) ||
      c.courtId?.toLowerCase().includes(q) ||
      (c as any).courtName?.toLowerCase().includes(q)
    );
  }, [cases, filter]);

  // Actual columns based on terminal width (approximated via render)
  const getCols = useCallback(() => {
    // We can't get terminal width directly in Ink easily without useWindowSize
    // Using a default that works
    return calcCols(80);
  }, []);

  // Recalc on each render using available width
  const actualCols = getCols();

  const listHeight = 20; // approximated

  // Clamp selection to filtered list
  const safeSelected = Math.min(selected, filtered.length - 1);

  // Scroll
  const cur = Math.min(safeSelected, Math.max(0, safeSelected));
  const vtopAdjusted = Math.max(0, Math.min(vtop, Math.max(0, filtered.length - listHeight)));
  const showVtop = cur < vtopAdjusted ? cur : cur >= vtopAdjusted + listHeight ? cur - listHeight + 1 : vtopAdjusted;

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape || key.return) {
        setSearchMode(false);
        return;
      }
      if (key.backspace || key.delete) {
        setFilter(f => f.slice(0, -1));
        return;
      }
      if (input.length === 1 && !key.ctrl) {
        setFilter(f => f + input);
      }
      return;
    }

    if (key.upArrow) {
      onSelect(Math.max(0, selected - 1));
      return;
    }
    if (key.downArrow) {
      onSelect(Math.min(filtered.length - 1, selected + 1));
      return;
    }
    if (key.pageUp) {
      onSelect(Math.max(0, selected - listHeight));
      return;
    }
    if (key.pageDown) {
      onSelect(Math.min(filtered.length - 1, selected + listHeight));
      return;
    }
    if (key.home) {
      onSelect(0);
      return;
    }
    if (key.end) {
      onSelect(filtered.length - 1);
      return;
    }
    if (key.return) {
      if (filtered.length > 0) onEnter();
      return;
    }
    if (input === '/' || input === 'и') {
      setSearchMode(true);
      setFilter('');
      return;
    }
    if (key.delete && selected >= 0 && selected < filtered.length) {
      onDelete(filtered[selected].uid);
      return;
    }
  });

  if (!cases.length) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text dimColor>  Дел нет. Запустите API: npm start</Text>
      </Box>
    );
  }

  const shown = filtered.slice(showVtop, showVtop + listHeight);
  const scrollPct = filtered.length > listHeight ? showVtop / (filtered.length - listHeight) : 0;
  const scrollPos = Math.round(scrollPct * (listHeight - 1));

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Search bar */}
      {searchMode && (
        <Box>
          <Text bold>/</Text>
          <Text>{filter}</Text>
          <Text dimColor>█</Text>
        </Box>
      )}

      {/* Header */}
      <Box>
        <Box width={actualCols.num + 2}>
          <Text bold underline>№ ДЕЛА</Text>
        </Box>
        <Box width={actualCols.status + 2}>
          <Text bold underline>СТАТУС</Text>
        </Box>
        <Box width={actualCols.court + 2}>
          <Text bold underline>СУД</Text>
        </Box>
        <Box flexGrow={1}>
          <Text bold underline>РЕШЕНИЕ</Text>
        </Box>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {shown.map((c, i) => {
          const idx = showVtop + i;
          const sel = idx === cur;
          const courtName = (c as any).courtName || c.courtId || '—';
          const statusColor = STATUS_COLOR[c.status] || undefined;
          const statusLabel = STATUS_RU[c.status] || c.status;
          const num = truncate(c.number || '—', actualCols.num);
          const court = truncate(courtName, actualCols.court);
          const result = truncate(c.result || '—', actualCols.result);

          return (
            <Box key={c.uid}>
              <Box width={actualCols.num + 2}>
                {sel ? <Text inverse bold>{num}</Text> : <Text bold>{num}</Text>}
              </Box>
              <Box width={actualCols.status + 2}>
                <Text color={statusColor}>{statusLabel}</Text>
              </Box>
              <Box width={actualCols.court + 2}>
                <Text>{court}</Text>
              </Box>
              <Box flexGrow={1}>
                <Text color={sel ? undefined : c.status === 'error' ? 'red' : undefined}>{result}</Text>
              </Box>
            </Box>
          );
        })}

        {/* Scroll indicator */}
        {filtered.length > listHeight && (
          <Box>
            <Text dimColor>
              {Array.from({ length: listHeight }, (_, i) =>
                i === scrollPos ? '█' : '│'
              ).join('')}
            </Text>
          </Box>
        )}

        {/* Count */}
        <Box marginTop={1}>
          <Text dimColor>
            {filter ? `Найдено: ${filtered.length} из ${cases.length}` : `Всего: ${cases.length}`}
            {filter && '  [Esc] сбросить фильтр'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
