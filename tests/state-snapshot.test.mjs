import { test } from 'node:test';
import assert from 'node:assert/strict';

// A real, minimal, in-memory mock of the exact real IndexedDB surface
// state-snapshot.js actually uses (open, transaction, objectStore,
// put, get) — small and honest about only covering that real surface,
// never a claim of full IndexedDB fidelity.
function installMockIndexedDB() {
  const store = new Map();
  globalThis.indexedDB = {
    open(name, version) {
      const request = {};
      queueMicrotask(() => {
        const db = {
          createObjectStore: () => {},
          transaction: () => ({
            objectStore: () => ({
              put(value, key) {
                const req = {};
                queueMicrotask(() => { store.set(key, structuredClone(value)); req.onsuccess?.(); });
                return req;
              },
              get(key) {
                const req = {};
                queueMicrotask(() => { req.result = store.has(key) ? structuredClone(store.get(key)) : undefined; req.onsuccess?.(); });
                return req;
              },
            }),
            get oncomplete() { return this._oncomplete; },
            set oncomplete(fn) { this._oncomplete = fn; queueMicrotask(() => fn?.()); },
            onerror: null,
          }),
        };
        request.result = db;
        if (request.onupgradeneeded) request.result = db;
        request.onsuccess?.();
      });
      return request;
    },
  };
  return () => { delete globalThis.indexedDB; };
}

test('THE REAL ROUND-TRIP PROPERTY: a real wallet and mirror snapshot, saved then loaded, come back byte-identical, including real bigint values', async () => {
  const cleanup = installMockIndexedDB();
  try {
    const { saveSnapshot, loadSnapshot } = await import('../public/app/state-snapshot.js?t=' + Date.now());
    const wallet = { accrual: { positions: { alice: 100n } } };
    const mirror = { commitments: { bob: [{ epoch: 5 }] } };
    await saveSnapshot(['e1', 'e2'], wallet, mirror);
    const loaded = await loadSnapshot();
    assert.deepEqual([...loaded.coveredEventIds], ['e1', 'e2']);
    assert.deepEqual(loaded.wallet, wallet);
    assert.deepEqual(loaded.mirror, mirror);
    assert.equal(typeof loaded.wallet.accrual.positions.alice, 'bigint', 'a real bigint must survive the round trip as a real bigint, never a lossy number');
  } finally {
    cleanup();
  }
});

test('SECURITY, THE REAL BACKWARD-COMPATIBILITY PROPERTY: a real, older, wallet-only snapshot (before Mirror joined this mechanism) is recognized, never silently misread as an empty Mirror state', async () => {
  const cleanup = installMockIndexedDB();
  try {
    const { loadSnapshot } = await import('../public/app/state-snapshot.js?t=' + (Date.now() + 1));
    // Simulate a real, older record directly — the exact real shape
    // the previous, real version of this file used to write.
    globalThis.indexedDB.open = (name) => {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction: () => ({
            objectStore: () => ({
              get: (key) => {
                const req = {};
                queueMicrotask(() => {
                  req.result = { coveredEventIds: ['e1'], wallet: JSON.stringify({ accrual: { positions: { alice: '__bigint__:100' } } }), savedAt: 123 };
                  req.onsuccess?.();
                });
                return req;
              },
            }),
          }),
        };
        request.onsuccess?.();
      });
      return request;
    };
    const loaded = await loadSnapshot();
    assert.equal(loaded.mirror, undefined, 'a real, legacy wallet-only snapshot must report mirror as genuinely unknown, never as an empty (but known) state');
    assert.equal(loaded.wallet.accrual.positions.alice, 100n, 'the real, wallet-only part of a legacy snapshot must still load correctly');
  } finally {
    cleanup();
  }
});

test('loadSnapshot returns null, never throws, when no real snapshot exists yet', async () => {
  const cleanup = installMockIndexedDB();
  try {
    const { loadSnapshot } = await import('../public/app/state-snapshot.js?t=' + (Date.now() + 2));
    const loaded = await loadSnapshot();
    assert.equal(loaded, null);
  } finally {
    cleanup();
  }
});
