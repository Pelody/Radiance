// 發佈成 claude.ai 網頁時的雲端存檔 (db capability，每位玩家私人的 data/users/<id>/radiance/save)。
// 不在 claude.ai 裡 (本機 npm run dev、直接開 dist/index.html) 時 use() 不存在，只用 localStorage。
interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface Db {
  doc(path: string): DocRef;
}
interface User {
  id(): Promise<string | null>;
}
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

let refPromise: Promise<DocRef | null> | null = null;

function saveRef(): Promise<DocRef | null> {
  if (!refPromise) {
    refPromise = (async () => {
      const host = (window as unknown as { claude?: ClaudeHost }).claude;
      if (!host?.use) return null;
      try {
        const [db, user] = (await Promise.all([host.use('db'), host.use('user')])) as [Db | null, User | null];
        const id = await user?.id();
        if (!db || !id) return null;
        return db.doc(`data/users/${id}/radiance/save`);
      } catch {
        return null;
      }
    })();
  }
  return refPromise;
}

export async function cloudLoad(): Promise<{ json: string; savedAt: number } | null> {
  const ref = await saveRef();
  if (!ref) return null;
  try {
    const snap = await ref.get();
    const d = snap.exists ? snap.data() : undefined;
    return d && typeof d.json === 'string' ? { json: d.json, savedAt: Number(d.savedAt) || 0 } : null;
  } catch {
    return null;
  }
}

// 一次只寫一筆；寫入期間又有新存檔時，只保留最新的 (db：one write at a time per doc)
let writing = false;
let queued: { json: string; savedAt: number } | null = null;

export async function cloudSave(json: string, savedAt: number): Promise<void> {
  queued = { json, savedAt };
  if (writing) return;
  const ref = await saveRef();
  if (!ref) return;
  writing = true;
  try {
    while (queued) {
      const item = queued;
      queued = null;
      await ref.set(item).catch(() => {});
    }
  } finally {
    writing = false;
  }
}
