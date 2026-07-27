import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TabLayout from './components/tab-layout.js';
import CaseList from './components/case-list.js';
import CaseDetail from './components/case-detail.js';
import Notifications from './components/notifications.js';
import RunPanel from './components/run-panel.js';
import StatusBar from './components/status-bar.js';
import AddCase from './components/add-case.js';
import * as api from './api.js';
import type { WatchedCase, DashboardStats, TabId, View } from './types.js';

export default function App() {
  const { exit } = useApp();

  // State
  const [tab, setTab] = useState<TabId>('cases');
  const [view, setView] = useState<View>('list');
  const [cases, setCases] = useState<WatchedCase[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selected, setSelected] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch data
  const fetchData = useCallback(() => {
    api.listCases()
      .then(d => { setCases(d); setLoading(false); setError(''); })
      .catch(e => { setLoading(false); setError(e.message); });
    api.getStats()
      .then(setStats)
      .catch(() => {});
    if (tab === 'notifications') {
      api.getNotifications()
        .then(setNotifications)
        .catch(() => {});
    }
  }, [tab]);

  // Auto-refresh
  useEffect(() => {
    fetchData();
    refreshTimer.current = setInterval(fetchData, 60_000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [fetchData]);

  // Refresh on tab switch
  useEffect(() => {
    fetchData();
  }, [tab, fetchData]);

  const errorCount = cases.filter(c => c.status === 'error').length;

  // Keyboard
  useInput((input, key) => {
    // Global shortcuts
    if (key.ctrl && (input === 'c' || input === 'd')) { exit(); return; }
    if (input === 'q' || input === 'й') { exit(); return; }

    // Modal takes priority
    if (showAdd) return;

    // Tab switching
    if (input === '1') { setTab('cases'); setView('list'); return; }
    if (input === '2') { setTab('notifications'); return; }
    if (input === '3') { setTab('run'); return; }
    if (key.leftArrow && key.ctrl) {
      const tabs: TabId[] = ['cases', 'notifications', 'run'];
      const idx = tabs.indexOf(tab);
      setTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
      setView('list');
      return;
    }
    if (key.rightArrow && key.ctrl) {
      const tabs: TabId[] = ['cases', 'notifications', 'run'];
      const idx = tabs.indexOf(tab);
      setTab(tabs[(idx + 1) % tabs.length]);
      setView('list');
      return;
    }

    // Add case
    if (input === 'a' || input === 'ф') {
      if (tab === 'cases') { setShowAdd(true); return; }
    }

    // Refresh (Ctrl+R)
    if (key.ctrl && input === 'r') {
      fetchData();
      return;
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" height="100%">
        <Text>Загрузка...</Text>
      </Box>
    );
  }

  if (error && !cases.length) {
    return (
      <Box flexDirection="column" height="100%">
        <Text color="red">Ошибка подключения к API: {error}</Text>
        <Text dimColor>Запустите npm start</Text>
        <Text dimColor>Нажмите q для выхода</Text>
      </Box>
    );
  }

  // Tab config
  const tabs = [
    { id: 'cases' as TabId, label: 'ДЕЛА', count: cases.length },
    { id: 'notifications' as TabId, label: 'УВЕД', count: notifications.length },
    { id: 'run' as TabId, label: 'ЗАПУСК' },
  ];

  const renderContent = () => {
    if (showAdd) {
      return <AddCase onDone={() => setShowAdd(false)} onRefresh={fetchData} />;
    }

    if (tab === 'cases') {
      if (view === 'detail') {
        const c = cases[selected];
        if (c) {
          return <CaseDetail c={c} onBack={() => setView('list')} />;
        }
        setView('list');
      }
      return (
        <CaseList
          cases={cases}
          selected={selected}
          onSelect={setSelected}
          onEnter={() => setView('detail')}
          onDelete={uid => api.deleteCase(uid).then(fetchData)}
        />
      );
    }

    if (tab === 'notifications') {
      return <Notifications notifications={notifications} />;
    }

    if (tab === 'run') {
      return <RunPanel onRefresh={fetchData} />;
    }

    return null;
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Main content area */}
      <Box flexDirection="column" flexGrow={1}>
        <TabLayout tabs={tabs} active={tab} onSelect={id => { setTab(id); setView('list'); setShowAdd(false); }}>
          {renderContent()}
        </TabLayout>
      </Box>

      {/* Status bar */}
      <StatusBar stats={stats} tab={tab} total={cases.length} errorCount={errorCount} />

      {/* Footer hints */}
      <Box>
        <Text dimColor>
          1:Дела  2:Уведомления  3:Запуск  a:Добавить  ^R:Обновить  q:Выход
        </Text>
      </Box>
    </Box>
  );
}
