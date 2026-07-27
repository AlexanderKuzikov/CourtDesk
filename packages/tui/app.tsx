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

  useEffect(() => {
    fetchData();
    refreshTimer.current = setInterval(fetchData, 60_000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [tab, fetchData]);

  const errorCount = cases.filter(c => c.status === 'error').length;

  useInput((input, key) => {
    if (key.ctrl && (input === 'c' || input === 'd')) { exit(); return; }
    if (input === 'q' || input === 'й') { exit(); return; }
    if (showAdd) return;

    if (input === '1') { setTab('cases'); setView('list'); return; }
    if (input === '2') { setTab('notifications'); return; }
    if (input === '3') { setTab('run'); return; }
    if (key.ctrl && key.leftArrow) {
      const tabs: TabId[] = ['cases', 'notifications', 'run'];
      const idx = tabs.indexOf(tab);
      setTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
      setView('list');
      return;
    }
    if (key.ctrl && key.rightArrow) {
      const tabs: TabId[] = ['cases', 'notifications', 'run'];
      const idx = tabs.indexOf(tab);
      setTab(tabs[(idx + 1) % tabs.length]);
      setView('list');
      return;
    }
    if ((input === 'a' || input === 'ф') && tab === 'cases') { setShowAdd(true); return; }
    if (key.ctrl && input === 'r') { fetchData(); return; }
  });

  if (loading) return <Text>Загрузка...</Text>;

  if (error && !cases.length) {
    return (
      <Box flexDirection="column">
        <Text color="red">Ошибка: {error}</Text>
        <Text dimColor>Запустите API: npm start</Text>
        <Text dimColor>q — выход</Text>
      </Box>
    );
  }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'cases', label: 'ДЕЛА', count: cases.length },
    { id: 'notifications', label: 'УВЕД', count: notifications.length },
    { id: 'run', label: 'ЗАПУСК' },
  ];

  return (
    <Box flexDirection="column" height="100%">
      <Box flexGrow={1}>
        <TabLayout tabs={tabs} active={tab} onSelect={id => { setTab(id); setView('list'); setShowAdd(false); }}>
          {showAdd ? <AddCase onDone={() => setShowAdd(false)} onRefresh={fetchData} /> :
           tab === 'cases' && view === 'detail' && cases[selected] ? <CaseDetail c={cases[selected]} onBack={() => setView('list')} /> :
           tab === 'cases' ? <CaseList cases={cases} selected={selected} onSelect={setSelected} onEnter={() => setView('detail')} onDelete={uid => api.deleteCase(uid).then(fetchData)} /> :
           tab === 'notifications' ? <Notifications notifications={notifications} /> :
           tab === 'run' ? <RunPanel onRefresh={fetchData} /> :
           null}
        </TabLayout>
      </Box>
      <StatusBar stats={stats} tab={tab} total={cases.length} errorCount={errorCount} />
      <Box>
        <Text dimColor>
          1:Дела  2:Увед 3:Запуск  a:Добавить  ^R:Обн  q:Выход
        </Text>
      </Box>
    </Box>
  );
}
