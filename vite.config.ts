import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 純前端、離線可玩 (UI-01)：JS/CSS 內嵌到單一 index.html，卡圖與圖示用相對路徑，
// 打包後直接用瀏覽器打開 dist/index.html 就能玩 (不需要伺服器)。
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
