import React from 'react';
import { Box, Text } from 'ink';
import type { TabId } from '../types.js';

interface TabLayoutProps {
  tabs: { id: TabId; label: string; count?: number }[];
  active: TabId;
  onSelect: (id: TabId) => void;
  children: React.ReactNode;
}

export default function TabLayout({ tabs, active, onSelect, children }: TabLayoutProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Tab bar */}
      <Box>
        {tabs.map(t => {
          const sel = t.id === active;
          const label = t.count !== undefined ? `${t.label} (${t.count})` : t.label;
          return (
            <Box key={t.id} marginRight={1}>
              <Text inverse={sel} bold={sel}>{` ${label} `}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Content */}
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
}
