const DB_VERSION = 1;
const STORE_NAME = 'events';

export function topologicalSortForReplay(events) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const visited = new Set();
  const order = [];
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const ev = byId.get(id);
    if (!ev) return;
    for (const p of ev.parents) visit(p);
    order.push(ev);
  }
  for (const ev of events) visit(ev.id);
  return order;
}

function openDb(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function persistEvent(dbName, event) {
  const db = await openDb(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllEvents(dbName) {
  const db = await openDb(dbName);
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Restores every previously-persisted event into a fresh EventDag,
// then subscribes so every future genuinely-new event is
// automatically persisted going forward. Uses loadTrusted() — real
// hash recomputation for every single locally-generated event on
// every page load is redundant work for content this exact domain
// already verified once, at real creation time; it would otherwise
// grow without bound the longer a domain runs. Ids are still recomputed
// (via the normal addEvent()) for anything genuinely new or externally
// received, going forward — this fast path is only for restoring this
// domain's own already-trusted local history.
export async function createPersistedDag(dbName, dag) {
  const stored = await loadAllEvents(dbName);
  const ordered = topologicalSortForReplay(stored);
  dag.loadTrusted(ordered);
  dag.subscribe((event) => {
    persistEvent(dbName, event).catch((err) => console.error(`Failed to persist event ${event.id}:`, err));
  });
  return dag;
}
