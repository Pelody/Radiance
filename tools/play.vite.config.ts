// 把 tools/play.ts 打包成 Node 可執行的檔案 (npm run play:build)
import { defineConfig } from 'vite';
export default defineConfig({
  build: { ssr: 'tools/play.ts', outDir: 'tools/.play', emptyOutDir: true, target: 'node22' },
});
