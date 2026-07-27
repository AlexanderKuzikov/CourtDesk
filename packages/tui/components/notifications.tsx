import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Notification } from '../types.js';

interface NotificationsProps {
  notifications: Notification[];
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Notifications({ notifications }: NotificationsProps) {
  if (!notifications.length) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text dimColor>  Нет уведомлений</Text>
      </Box>
    );
  }

  // Sort newest first
  const sorted = useMemo(() =>
    [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [notifications],
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box borderStyle="single" borderDimColor>
        <Text bold> Уведомления ({notifications.length})</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {sorted.map(n => (
          <Box key={n.uid}>
            <Box marginRight={1}>
              <Text color={n.read ? 'gray' : 'green'}>
                {n.read ? '○' : '●'}
              </Text>
            </Box>
            <Box flexDirection="column" flexGrow={1}>
              <Text bold={!n.read}>{n.message}</Text>
              <Text dimColor>{fmtDateTime(n.createdAt)}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
