/* db.js — IndexedDB 離線包管理 */
const DB_NAME = 'rua-macau-offline';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

let db = null;

export async function openDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_NAME)) {
        d.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

export async function savePhoto(name, blob, meta) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ name, blob, meta, downloadedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllPhotos() {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

