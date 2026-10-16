// 日誌的規則編號 → 規格條文 (UI-08：點擊顯示該規則的白話說明)。直接讀 spec/*.md (打包時內嵌，離線可用)。
const files = import.meta.glob('../../spec/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const lines = Object.values(files).flatMap((t) => t.split('\n'));

function clean(t: string): string {
  return t
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^\s*[-|]\s*/, '')
    .trim();
}

const cache = new Map<string, string | null>();

/** 找規則條文；找不到時回傳 null */
export function ruleText(id: string): string | null {
  if (cache.has(id)) return cache.get(id)!;
  const base = id.split(' ')[0];
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\*\\*${esc}(\\*\\*|[ \\u3000(（：:])`);
  let out: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    const parts = [clean(lines[i])];
    // 接著的縮排子項目
    for (let j = i + 1; j < lines.length && /^\s{2,}[-|]/.test(lines[j]); j++) parts.push(clean(lines[j]));
    out = parts.join('\n');
    break;
  }
  cache.set(id, out);
  return out;
}
