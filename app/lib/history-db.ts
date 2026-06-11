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

// One cached connection for the whole session. A 4-variation batch fires four
// parallel saves; opening/closing per call ran the open handshake four times
// concurrently for nothing. The browser closes it with the page; if another
// tab upgrades the schema (versionchange) we close and reopen on next use.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null; // let the next call retry
      reject(req.error);
    };
  });
  return dbPromise;
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
  await tx(db, "readwrite", (s) => s.put(rec));
}

/**
 * Newest-first records straight off the createdAt index (no full-store load +
 * JS sort). `limit` bounds how many Blobs are materialized into memory; omit
 * it for everything.
 */
export async function getAllLogos(limit = Infinity): Promise<HistoryRecord[]> {
  if (!available()) return [];
  const db = await openDb();
  return new Promise<HistoryRecord[]>((resolve, reject) => {
    const recs: HistoryRecord[] = [];
    const index = db.transaction(STORE, "readonly").objectStore(STORE).index("createdAt");
    const req = index.openCursor(null, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && recs.length < limit) {
        recs.push(cursor.value as HistoryRecord);
        cursor.continue();
      } else {
        resolve(recs);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Update a stored logo's metadata (favorite / name) without touching its blob. */
export async function patchLogo(
  id: string,
  patch: { favorite?: boolean; name?: string },
): Promise<void> {
  if (!available()) return;
  const db = await openDb();
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
}

export async function deleteLogo(id: string): Promise<void> {
  if (!available()) return;
  const db = await openDb();
  await tx(db, "readwrite", (s) => s.delete(id));
}

export async function clearLogos(): Promise<void> {
  if (!available()) return;
  const db = await openDb();
  await tx(db, "readwrite", (s) => s.clear());
}
