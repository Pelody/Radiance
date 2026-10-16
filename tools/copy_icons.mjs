// 把官方圖示 (fill="currentColor") 從 data/icons 複製到 public/icons (UI-04b)
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const src = 'data/icons';
const dst = 'public/icons';
mkdirSync(dst, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.svg'));
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log(`copied ${files.length} icons -> ${dst}`);
