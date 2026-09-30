// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL STORE — tiny IndexedDB key-value wrapper for whole-DB persistence
//
// Replaces localStorage as the local-first storage backend. localStorage caps at
// ~5–10MB per origin and the seeded Accurate dataset alone is ~5.7MB, so every
// transaction risked a silent QuotaExceededError. IndexedDB stores the DB object
// via structured clone (no JSON.stringify) and offers hundreds of MB of quota.
//
// Keys live in one object store ('kv') of database 'nsa-local'. Values are
// stored as-is (structured clone happens synchronously inside put(), so callers
// may mutate the object right after kvSet returns its promise).
// ═══════════════════════════════════════════════════════════════════════════════

const DB_NAME = 'nsa-local';
const DB_VERSION = 1;
const STORE = 'kv';

let _dbPromise = null;

function openDb() {
  if (_dbPromise) {
    return _dbPromise;
  }
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
  return _dbPromise;
}

export async function kvGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    req.onerror = () => reject(req.error);
  });
}

export async function kvDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
