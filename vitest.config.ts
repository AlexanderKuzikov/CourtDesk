import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    forks: { singleFork: false },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/**/*.ts'],
      exclude: [
        'packages/**/*.test.ts',
        'packages/tui/**',      // заморожен (ADR 2026-08-02)
        'packages/tui-go/**',   // Go, не TS
        'packages/courtdesktop/**', // Go, не TS
      ],
      // CR12-S07 FIXED: пороги по состоянию 2026-08-03 (44/39/38/43) —
      // защита от деградации; повышать по мере роста тестов
      thresholds: {
        lines: 44,
        functions: 38,
        branches: 38,
        statements: 42,
      },
    },
  },
});