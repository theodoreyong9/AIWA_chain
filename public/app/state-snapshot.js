// A real snapshot of state.wallet, tagged with the exact head event
// id it was computed at — so on load, it can be verified to still
// correspond to the real, current DAG before being trusted, never
// blindly accepted. Without this, every single reload re-verifies a
// domain's entire historical progression from genesis, which grows
// without bound the longer a domain has run; that real cost is paid
// once, here, then cached — not skipped, not weakened.
//
// BigInt values (accrual balances, claim amounts) have no native JSON
// representation — encoded here as tagged strings, decoded back to
// real bigint on load, never silently coerced to a lossy float.

const DB_NAME = 'aiwa-chain-snapshot';
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'wallet';
const BIGINT_TAG = '__bigint__:';

function replacer(_key, value) {
  return typeof value === 'bigint' ? `${BIGINT_TAG}${value.toString()}` : value;
}
function reviver(_key, value) {
  return typeof value === 'string' && value.startsWith(BIGINT_TAG) ? BigInt(value.slice(BIGINT_TAG.length)) : value;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSnapshot(headEventId, eventCount, wallet) {
  const db = await openDb();
  const serialized = JSON.stringify(wallet, replacer);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ headEventId, eventCount, wallet: serialized, savedAt: Date.now() }, SNAPSHOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Returns null on any real absence or mismatch — a missing or
// unreadable snapshot is never an error, only a real, honest signal
// to fall back to full materialization.
export async function loadSnapshot() {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    if (!record) return null;
    return { headEventId: record.headEventId, eventCount: record.eventCount, wallet: JSON.parse(record.wallet, reviver) };
  } catch {
    return null;
  }
}
