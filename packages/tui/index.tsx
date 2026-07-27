#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import App from './app.js';

// Check TTY early — Ink requires raw mode
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('TUI требует терминала. Запустите в cmd, PowerShell, bash или Windows Terminal.');
  process.exit(1);
}

// Quit on Ctrl+C explicitly
process.on('SIGINT', () => {
  process.exit(0);
});

try {
  const { waitUntilExit } = render(<App />, { fullScreen: true });
  await waitUntilExit();
  process.exit(0);
} catch (e) {
  console.error('Ошибка TUI:', e instanceof Error ? e.message : e);
  process.exit(1);
}
