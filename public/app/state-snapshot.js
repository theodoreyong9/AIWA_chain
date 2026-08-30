// A real snapshot of state.wallet, tagged with the exact SET of event
// ids it was computed over — never a position/index in topoOrder(),
// which has no guaranteed stability once a local DAG holds more than
// one domain's events (their relative interleaving depends on hash
// comparison, not insertion order). A real set-membership check has
// no such fragility: catch-up work is simply "every current event not
// in this set", regardless of where it happens to fall in any
// particular topological ordering.
//
// Without this, every single reload re-verifies a domain's entire
// historical progression from genesis, which grows without bound the
// longer a domain has run; that real cost is paid once, here, then
// cached — not skipped, not weakened.
//
// BigInt values (accrual balances, claim amounts) have no native JSON
// representation — encoded here as tagged strings, decoded back to
// real bigint on load, never silently coerced to a lossy float.

// A real snapshot of state.wallet AND state.mirror together, tagged
// with the exact SET of event ids both were computed over — never a
// position/index in topoOrder(), which has no guaranteed stability
// once a local DAG holds more than one domain's events (their
// relative interleaving depends on hash comparison, not insertion
// order). A real set-membership check has no such fragility:
// catch-up work is simply "every current event not in this set",
// regardless of where it happens to fall in any particular
// topological ordering.
//
// Without this, every single reload re-verifies a domain's entire
// historical progression from genesis, which grows without bound the
// longer a domain has run; that real cost is paid once, here, then
// cached — not skipped, not weakened. Mirror was added to this
// identical, already-working mechanism after finding, honestly
// (§12.1), that it alone still replayed fully on every real boot even
// after wallet's own snapshot was already working.
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

export async function saveSnapshot(coveredEventIds, wallet, mirror) {
  const db = await openDb();
  const serialized = JSON.stringify({ wallet, mirror }, replacer);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ coveredEventIds, state: serialized, savedAt: Date.now() }, SNAPSHOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Returns null on any real absence or mismatch — a missing or
// unreadable snapshot is never an error, only a real, honest signal
// to fall back to full materialization. A real, older snapshot saved
// before Mirror joined this mechanism has no real `mirror` field —
// `mirror` comes back `undefined` in that case, a real, honest signal
// for the caller to fall back to a full Mirror replay just this once,
// never silently treated as an empty (rather than unknown) Mirror
// state.
export async function loadSnapshot() {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    if (!record) return null;
    // A real, older record (before Mirror joined this snapshot) used
    // the field name `wallet` directly for the serialized payload —
    // recognized and handled here so an existing, real, already-saved
    // snapshot on someone's real device is never silently discarded.
    const raw = record.state ?? record.wallet;
    const parsed = JSON.parse(raw, reviver);
    const isLegacyWalletOnly = record.state === undefined;
    return {
      coveredEventIds: new Set(record.coveredEventIds),
      wallet: isLegacyWalletOnly ? parsed : parsed.wallet,
      mirror: isLegacyWalletOnly ? undefined : parsed.mirror,
    };
  } catch {
    return null;
  }
}
