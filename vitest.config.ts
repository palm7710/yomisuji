import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // テストではサーバー専用の目印を空にする
      'server-only': path.resolve(__dirname, 'src/test/empty.ts'),
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
