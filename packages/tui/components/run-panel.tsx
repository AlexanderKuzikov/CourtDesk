import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { runParse } from '../api.js';
import type { RunLogEntry } from '../types.js';

interface RunPanelProps {
  onRefresh: () => void;
}

function fmtTime(): string {
  const d = new Date();
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function RunPanel({ onRefresh }: RunPanelProps) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<RunLogEntry[]>([]);
  const logRef = useRef<RunLogEntry[]>([]);

  const doRun = useCallback((mode: string) => {
    if (busy) return;
    setBusy(true);
    const entry: RunLogEntry = { ts: fmtTime(), mode };
    logRef.current = [...logRef.current, entry];
    setLog([...logRef.current]);

    runParse(mode as 'full' | 'retry' | 'new')
      .then(() => {
        logRef.current = [...logRef.current, { ts: fmtTime(), mode, ok: true }];
        setLog([...logRef.current]);
        onRefresh();
      })
      .catch((err: Error) => {
        logRef.current = [...logRef.current, { ts: fmtTime(), mode, ok: false, error: err.message }];
        setLog([...logRef.current]);
      })
      .finally(() => setBusy(false));
  }, [busy, onRefresh]);

  useInput((input, key) => {
    // Access F-key name via internal parser — Ink's Key type doesn't expose it
    const keyName = (key as any).name as string | undefined;

    // F4 / 'f' for full
    if ((keyName === 'f4' || input === 'f' || input === 'а') && !busy) { doRun('full'); return; }
    // F5 / 'r' for retry
    if ((keyName === 'f5' || input === 'r' || input === 'к') && !busy) { doRun('retry'); return; }
    // F6 / 'n' for new
    if ((keyName === 'f6' || input === 'n' || input === 'т') && !busy) { doRun('new'); return; }
  });

  // Show last N log entries
  const maxLog = 15;
  const visibleLog = log.slice(-maxLog);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box>
        <Text bold>ЗАПУСК МОНИТОРИНГА</Text>
        {busy && <Text color="yellow"> ⧗ выполняется...</Text>}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color={busy ? 'gray' : 'yellow'}>F4 / f</Text>
          <Text dimColor>  — Полный прогон (все дела) </Text>
        </Text>
        <Text>
          <Text color={busy ? 'gray' : 'yellow'}>F5 / r</Text>
          <Text dimColor>  — Retry (только ошибочные) </Text>
        </Text>
        <Text>
          <Text color={busy ? 'gray' : 'yellow'}>F6 / n</Text>
          <Text dimColor>  — Новые дела (waiting) </Text>
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {visibleLog.map((entry, i) => (
          <Box key={i}>
            <Text dimColor>{entry.ts}</Text>
            <Text> </Text>
            <Text color={entry.ok === true ? 'green' : entry.ok === false ? 'red' : 'yellow'}>
              {entry.ok === true ? '✓' : entry.ok === false ? '✗' : '→'}
            </Text>
            <Text> {entry.mode}</Text>
            {entry.error && <Text color="red"> — {entry.error}</Text>}
          </Box>
        ))}
        {!log.length && <Text dimColor>  (Запусков не было)</Text>}
      </Box>
    </Box>
  );
}
