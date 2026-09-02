/* IndexedDB access layer.
   The whole dataset is small enough to live in memory (see store.js), so this
   file only deals with reading everything once and writing single records. */

const DB_NAME = 'liftlog';
const DB_VERSION = 1;
export const STORES = ['settings', 'exercises', 'plans', 'workouts', 'sessions'];

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(names, mode) {
  return _db.transaction(names, mode);
}

export async function getAll(storeName) {
  await open();
  return new Promise((resolve, reject) => {
    const req = tx([storeName], 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function put(storeName, record) {
  await open();
  return new Promise((resolve, reject) => {
    const t = tx([storeName], 'readwrite');
    t.objectStore(storeName).put(record);
    t.oncomplete = () => resolve(record);
    t.onerror = () => reject(t.error);
  });
}

export async function putMany(storeName, records) {
  await open();
  if (!records.length) return;
  return new Promise((resolve, reject) => {
    const t = tx([storeName], 'readwrite');
    const os = t.objectStore(storeName);
    for (const r of records) os.put(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function remove(storeName, id) {
  await open();
  return new Promise((resolve, reject) => {
    const t = tx([storeName], 'readwrite');
    t.objectStore(storeName).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function clearAll() {
  await open();
  return new Promise((resolve, reject) => {
    const t = tx(STORES, 'readwrite');
    for (const name of STORES) t.objectStore(name).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
