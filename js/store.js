// Tiny IndexedDB key-value store. Everything the app owns lives here on the device.
const DB_NAME = 'growth-journal';
const STORE = 'kv';
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const r = fn(s);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

export const get = (key) => tx('readonly', (s) => s.get(key));
export const set = (key, val) => tx('readwrite', (s) => s.put(val, key));
export const del = (key) => tx('readwrite', (s) => s.delete(key));
export const keys = () => tx('readonly', (s) => s.getAllKeys());

// Ask the browser not to evict our storage (best effort; Home Screen apps on iOS are already exempt from the 7-day cap).
export async function persist() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* ignore */ }
  return false;
}
