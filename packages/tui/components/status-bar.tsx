import React from 'react';
import { Box, Text } from 'ink';
import type { DashboardStats } from '../types.js';

interface StatusBarProps {
  stats: DashboardStats | null;
  tab: string;
  total: number;
  errorCount: number;
}

export default function StatusBar({ stats, tab, total, errorCount }: StatusBarProps) {
  const healthColor = !stats || stats.health === 'ok' ? 'green' : stats.health === 'degraded' ? 'yellow' : 'red';
  const healthLabel = !stats ? '…' : stats.health === 'ok' ? '✓' : stats.health === 'degraded' ? '⚠' : '✗';

  return (
    <Box borderStyle="single" borderDimColor>
      <Box flexGrow={1}>
        <Text bold> CourtDesk </Text>
        <Text dimColor>│</Text>
        <Text> Дел: {total} </Text>
        {errorCount > 0 && <Text color="red"> Ош: {errorCount} </Text>}
        {stats && (
          <>
            <Text dimColor>│</Text>
            <Text> M: {stats.monitoring} </Text>
            <Text> W: {stats.waiting} </Text>
            <Text> D: {stats.decision} </Text>
          </>
        )}
      </Box>
      <Box>
        <Text color={healthColor}>{healthLabel}</Text>
        <Text dimColor>  [{tab}]</Text>
      </Box>
    </Box>
  );
}
