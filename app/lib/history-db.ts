import type { GenParams } from "@/app/components/Gallery";

/**
 * On-device logo history (IndexedDB). Account-less persistence: survives
 * reloads, never leaves the browser. Images are stored as Blobs (data URLs are
 * 1-2 MB each and would blow localStorage's ~5 MB quota). Every call is
 * SSR-guarded and resolves to a safe default if IndexedDB is unavailable
 * (private mode, blocked), so the app silently falls back to in-memory only.
 */

export type HistoryRecord = {
  id: string;
  companyName: string;
  params: GenParams;
  createdAt: number;
  blob: Blob;
  favorite?: boolean;
  name?: string; // user-given label, overrides companyName for display
};

const DB_NAME = "logocreator";
const STORE = "logos";
const VERSION = 1;

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    run(t.objectStore(STORE));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function saveLogo(rec: HistoryRecord): Promise<void> {
  if (!available()) return;
  const db = await openDb();
  try {
    await tx(db, "readwrite", (s) => s.put(rec));
  } finally {
    db.close();
  }
}

export async function getAllLogos(): Promise<HistoryRecord[]> {
  if (!available()) return [];
  const db = await openDb();
  try {
    const recs = await new Promise<HistoryRecord[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as HistoryRecord[]);
      req.onerror = () => reject(req.error);
    });
    return recs.sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

/** Update a stored logo's metadata (favorite / name) without touching its blob. */
export async function patchLogo(
  id: string,
  patch: { favorite?: boolean; name?: string },
): Promise<void> {
  if (!available()) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      const store = t.objectStore(STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result as HistoryRecord | undefined;
        if (rec) {
          store.put({ ...rec, ...patch });
        } else {
          // Reject rather than silently no-op so the caller can surface that a
          // favorite/rename didn't persist (instead of it vanishing on reload).
          reject(new Error("record not found"));
        }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteLogo(id: string): Promise<void> {
  if (!available()) return;
  const db = await openDb();
  try {
    await tx(db, "readwrite", (s) => s.delete(id));
  } finally {
    db.close();
  }
}

export async function clearLogos(): Promise<void> {
  if (!available()) return;
  const db = await openDb();
  try {
    await tx(db, "readwrite", (s) => s.clear());
  } finally {
    db.close();
  }
}
