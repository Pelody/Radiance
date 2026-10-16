import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 純前端、離線可玩 (UI-01)：相對路徑 base，打包後可直接開 dist/index.html 的伺服器版本
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
