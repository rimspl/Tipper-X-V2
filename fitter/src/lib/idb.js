import { DB_NAME, DB_VERSION, STORES } from './constants.js';

let dbPromise;

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.submissions)) {
        const submissions = db.createObjectStore(STORES.submissions, { keyPath: 'local_id' });
        submissions.createIndex('sync_state', 'sync_state', { unique: false });
        submissions.createIndex('form_type', 'form_type', { unique: false });
        submissions.createIndex('updated_at', 'updated_at', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.media)) {
        const media = db.createObjectStore(STORES.media, { keyPath: 'media_local_id' });
        media.createIndex('submission_local_id', 'submission_local_id', { unique: false });
        media.createIndex('step_id', 'step_id', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.syncQueue)) {
        const queue = db.createObjectStore(STORES.syncQueue, { keyPath: 'queue_id' });
        queue.createIndex('submission_local_id', 'submission_local_id', { unique: false });
        queue.createIndex('status', 'status', { unique: false });
        queue.createIndex('next_retry_at', 'next_retry_at', { unique: false });
        queue.createIndex('updated_at', 'updated_at', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open indexedDB'));
  });

  return dbPromise;
}

function wrapRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

async function withStore(storeName, mode, runner) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    let result;
    Promise.resolve()
      .then(() => runner(store))
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        reject(error);
      });

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error(`Transaction failed for ${storeName}`));
    tx.onabort = () => reject(tx.error || new Error(`Transaction aborted for ${storeName}`));
  });
}

export async function putSubmission(submission) {
  return withStore(STORES.submissions, 'readwrite', (store) => wrapRequest(store.put(submission)));
}

export async function getSubmission(localId) {
  return withStore(STORES.submissions, 'readonly', (store) => wrapRequest(store.get(localId)));
}

export async function listSubmissions() {
  return withStore(STORES.submissions, 'readonly', (store) => wrapRequest(store.getAll()));
}

export async function updateSubmission(localId, patch) {
  const current = await getSubmission(localId);
  if (!current) return null;

  const next = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString()
  };

  await putSubmission(next);
  return next;
}

export async function putMediaItems(mediaItems = []) {
  return withStore(STORES.media, 'readwrite', async (store) => {
    for (const item of mediaItems) {
      await wrapRequest(store.put(item));
    }
  });
}

export async function listMediaBySubmission(submissionLocalId) {
  return withStore(STORES.media, 'readonly', (store) => {
    const index = store.index('submission_local_id');
    return wrapRequest(index.getAll(submissionLocalId));
  });
}

export async function putQueueItem(queueItem) {
  return withStore(STORES.syncQueue, 'readwrite', (store) => wrapRequest(store.put(queueItem)));
}

export async function getQueueItem(queueId) {
  return withStore(STORES.syncQueue, 'readonly', (store) => wrapRequest(store.get(queueId)));
}

export async function listQueueItems() {
  return withStore(STORES.syncQueue, 'readonly', (store) => wrapRequest(store.getAll()));
}

export async function listQueueByStatus(statuses = []) {
  const all = await listQueueItems();
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return all;
  }
  const set = new Set(statuses);
  return all.filter((item) => set.has(item.status));
}

export async function updateQueueItem(queueId, patch) {
  const current = await getQueueItem(queueId);
  if (!current) return null;

  const next = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString()
  };

  await putQueueItem(next);
  return next;
}

export async function setSetting(key, value) {
  return withStore(STORES.settings, 'readwrite', (store) => wrapRequest(store.put({ key, value })));
}

export async function getSetting(key, fallback = null) {
  const row = await withStore(STORES.settings, 'readonly', (store) => wrapRequest(store.get(key)));
  if (!row) return fallback;
  return row.value;
}

export async function clearAllData() {
  const db = await openDatabase();
  return Promise.all(
    Object.values(STORES).map((storeName) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error(`Failed to clear ${storeName}`));
      })
    )
  );
}
