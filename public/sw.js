// sw.js — caches the app shell so identity/wallet state already on this
// device still opens with no network. Real Solana ignition and any P2P
// sync with another peer obviously still need a genuine connection, but
// reading and accruing against state you already hold locally doesn't.

const CACHE_NAME = 'aiwa-chain-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './style.css',
  './app/app.js',
  './app/continuum.js',
  './app/generous-send-scan.js',
  './app/generous-view.js',
  './app/identity-cost-view.js',
  './app/identity.js',
  './app/ignition.js',
  './app/matching-contract-scan.js',
  './app/mirror-view.js',
  './app/network.js',
  './app/p2p-connection.js',
  './app/persistence.js',
  './app/reconciliation.js',
  './app/relative-rate-scan.js',
  './app/state-snapshot.js',
  './app/state.js',
  './app/sync-protocol.js',
  './app/trystero-connection.js',
  './app/vdf-worker.js',
  './core/accrual.js',
  './core/bigint-math.js',
  './core/causal-tick.js',
  './core/churn-analysis.js',
  './core/conservation.js',
  './core/contract-registry.js',
  './core/contract-scan.js',
  './core/domain-id.js',
  './core/event-dag.js',
  './core/fixed-point-math.js',
  './core/generous-transfer.js',
  './core/hardware-attestation.js',
  './core/identity-cost.js',
  './core/matching-contract.js',
  './core/mirror.js',
  './core/p2p-signaling.js',
  './core/progression.js',
  './core/relative-rate.js',
  './core/reward.js',
  './core/solana-wallet.js',
  './core/units.js',
  './core/vdf.js',
  './core/wallet.js',
  './core/weighted-median.js',
  './core/wesolowski-vdf.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only manage same-origin app-shell requests; let CDN modules (the
  // import-mapped @noble/*, @scure/*, qrcode, trystero) and Solana RPC
  // traffic pass straight through.
  if (url.origin !== self.location.origin) return;

  // Network-first, cache as fallback — not cache-first, so an online
  // reload always fetches the live deploy, and only falls back to
  // whatever's cached when the network request actually fails
  // (genuinely offline).
  event.respondWith(
    fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return res;
    }).catch(() => caches.match(event.request))
  );
});
