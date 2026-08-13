import { defineConfig } from 'vitest/config';

/**
 * テストはルールエンジン（DOM非依存）だけを対象にするので、
 * React プラグインを読まない軽量な設定を分けている。
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
