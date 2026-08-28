import { EventDag } from '../core/event-dag.js';
import { createPersistedDag } from './persistence.js';
import { materializeWallet, applyWalletEvent, initialWalletState } from '../core/wallet.js';
import { materializeMirror, deriveSourceEpochLookup } from '../core/mirror.js';
import { computeCausalTick } from '../core/causal-tick.js';
import { deriveIdentityCostState } from './identity-cost-view.js';
import { saveSnapshot, loadSnapshot } from './state-snapshot.js';
import { state, REWARD_PARAMS, VDF_ITERATIONS, notify } from './state.js';
import { renderContinuum } from './continuum.js';
import { renderIgnition } from './ignition.js';
import { renderMirror } from './mirror-view.js';

const DB_NAME = 'aiwa-chain-local';

// The full, real set of event ids covered by state.wallet's own
// current materialization — grown incrementally as new events are
// processed, restored from a snapshot on boot. Never a position or
// count in any particular topological ordering, which has no
// guaranteed stability once a local DAG holds more than one domain's
// events.
let coveredEventIds = new Set();
let lastSnapshotAt = 0;
const SNAPSHOT_INTERVAL_MS = 5000;

// The real, ongoing VDF computation runs on a dedicated worker thread
// — see vdf-worker.js's own header for why. One worker, reused across
// every epoch; a request/response pattern avoids real, repeated
// worker start-up cost.
let vdfWorker = null;
let requestCounter = 0;
const pendingRequests = new Map();

function getVdfWorker() {
  if (!vdfWorker) {
    vdfWorker = new Worker(new URL('./vdf-worker.js', import.meta.url), { type: 'module' });
    vdfWorker.onmessage = (e) => {
      const { requestId } = e.data;
      const resolve = pendingRequests.get(requestId);
      if (resolve) {
        pendingRequests.delete(requestId);
        resolve(e.data);
      }
    };
  }
  return vdfWorker;
}

function computeVdfOnWorker(domain, previousOutput, iterations) {
  const worker = getVdfWorker();
  const requestId = ++requestCounter;
  return new Promise((resolve) => {
    pendingRequests.set(requestId, (data) => resolve(data.vdfOutput));
    worker.postMessage({ requestId, kind: 'compute', domain, previousOutput, iterations });
  });
}

// A real verifyFn, injectable into progression.js's own applyProgressionEvent
// (see that file's own header) — moves the one-time, potentially large
// initial catch-up backlog's VDF verification off the main thread too,
// the identical real reason the ongoing loop already runs there.
function verifyVdfOnWorker(seed, iterations, output) {
  const worker = getVdfWorker();
  const requestId = ++requestCounter;
  return new Promise((resolve) => {
    pendingRequests.set(requestId, (data) => resolve(data.valid));
    worker.postMessage({ requestId, kind: 'verify', seed, iterations, output });
  });
}

// A full re-fold — real, honest, expensive work, reserved for cases
// that genuinely need it (an import can bring in events anywhere in
// causal history, not just at the end). Everyday actions (a claim, a
// send, a new epoch) use the cheap, real, incremental path instead —
// see applyIncremental below.
export async function rematerialize() {
  const events = state.dag.topoOrder();
  state.wallet = await materializeWallet(REWARD_PARAMS, events);
  coveredEventIds = new Set(events.map((e) => e.id));
  const lookup = deriveSourceEpochLookup(events);
  state.mirror = await materializeMirror(events, lookup);
  state.identityCost = deriveIdentityCostState(state.dag);
  await refreshCausalTick();
  notify();
  maybeSnapshot();
}

// Recomputes only what genuinely depends on "which identity is
// currently active" — never a reason on its own to redo wallet/mirror/
// identity-cost materialization, which are the same regardless of
// which identity happens to be connected right now.
export async function refreshCausalTick() {
  const events = state.dag.topoOrder();
  state.causalTick = state.domainId ? await computeCausalTick(state.mirror, state.identityCost, events, state.domainId) : null;
}

// Applies one real, new event directly to the already-materialized
// state — the normal path for everyday actions. Never re-verifies
// anything already covered.
export async function applyIncremental(id, parents, payload) {
  state.wallet = await applyWalletEvent(REWARD_PARAMS, state.wallet, { id, parents, payload });
  coveredEventIds.add(id);
  notify();
  maybeSnapshot();
}

// Saves a real snapshot at most every 5 real seconds — bounded
// catch-up backlog regardless of how many times the tab gets reloaded
// in between, unlike a pure event counter that resets on every load.
function maybeSnapshot() {
  const now = Date.now();
  if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;
  lastSnapshotAt = now;
  saveSnapshot([...coveredEventIds], state.wallet).catch((err) => console.error('Snapshot save failed:', err));
}

let progressionLoopRunning = false;
async function progressionLoop() {
  if (progressionLoopRunning) return;
  progressionLoopRunning = true;
  while (state.keypair) {
    const domain = state.domainId;
    const progression = state.wallet?.accrual?.progression?.domains?.[domain];
    const epoch = (progression?.epoch ?? 0) + 1;
    const previousOutput = progression?.vdfOutput ?? 'genesis';
    const lastId = progression?.lastId ?? state.genesisId;
    // The real, heavy computation happens off this thread entirely —
    // the main thread stays free to render and handle input for the
    // full duration of each epoch.
    const vdfOutput = await computeVdfOnWorker(domain, previousOutput, VDF_ITERATIONS);
    if (!state.keypair || state.domainId !== domain) break; // identity changed mid-computation — discard, do not misattribute
    const payload = { type: 'progression', domain, epoch, vdfIterations: VDF_ITERATIONS, vdfOutput };
    const newId = await state.dag.addEvent([lastId], payload);
    state.lastEventId = newId;
    state.lastEpochAt = Date.now();
    await applyIncremental(newId, [lastId], payload);
  }
  progressionLoopRunning = false;
}

export function startProgressionLoop() {
  progressionLoop();
}

export function render() {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.dataset.rendered = 'true';
  if (state.activeTab === 'ignition') renderIgnition(root);
  else if (state.activeTab === 'mirror') renderMirror(root);
  else renderContinuum(root);
}

async function boot() {
  lastSnapshotAt = Date.now(); // avoids an immediate, redundant re-save of what boot() itself just loaded
  const root = document.getElementById('app');
  const showProgress = (done, total, label) => {
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    root.innerHTML = `
      <div style="padding:60px 20px; text-align:center; font-family:monospace; color:#948a7a">
        <div style="font-size:13px">${label}</div>
        <div style="width:200px; height:4px; background:#262119; border-radius:2px; margin:16px auto; overflow:hidden">
          <div style="width:${pct}%; height:100%; background:#c98a3e; transition:width 0.15s"></div>
        </div>
        <div style="font-size:11px; color:#625a4d">${done} / ${total}</div>
      </div>
    `;
  };
  showProgress(0, 0, 'Loading local history\u2026');
  try {
    const dag = new EventDag();
    state.dag = await createPersistedDag(DB_NAME, dag);
    state.genesisId = await state.dag.addEvent([], { type: 'genesis' });
    state.lastEventId = state.genesisId;
    const events = state.dag.topoOrder();

    // A real, verified snapshot — trusted only for the exact set of
    // events it says it covers, never a position or count. Any event
    // not in that set is real, new catch-up work; nothing is skipped.
    const snapshot = await loadSnapshot();
    let base = initialWalletState();
    let remaining = events;
    if (snapshot) {
      base = snapshot.wallet;
      remaining = events.filter((e) => !snapshot.coveredEventIds.has(e.id));
      coveredEventIds = new Set(snapshot.coveredEventIds);
    }

    if (remaining.length > 0) {
      const label = snapshot ? 'Catching up since last snapshot\u2026' : 'Verifying real, historical progression\u2026';
      showProgress(0, remaining.length, label);
      for (let i = 0; i < remaining.length; i++) {
        // The real VDF verification for any 'progression' events in
        // this backlog runs on the same dedicated worker thread as
        // the ongoing loop — a real, possibly large one-time catch-up
        // must never compete with rendering or input handling either.
        base = await applyWalletEvent(REWARD_PARAMS, base, remaining[i], verifyVdfOnWorker);
        coveredEventIds.add(remaining[i].id);
        if (i % 20 === 0) showProgress(i + 1, remaining.length, label);
      }
    }
    state.wallet = base;

    const lookup = deriveSourceEpochLookup(events);
    state.mirror = await materializeMirror(events, lookup);
    state.identityCost = deriveIdentityCostState(state.dag);
    await refreshCausalTick();
    notify();
    render();
  } catch (err) {
    console.error('Boot failed:', err);
    root.innerHTML = `
      <div style="padding:40px 20px; text-align:center; font-family:monospace; color:#ede6d9">
        <div style="font-size:20px; margin-bottom:12px">Something real failed to load.</div>
        <div style="color:#948a7a; font-size:13px; margin-bottom:16px">${err?.message ?? String(err)}</div>
        <div style="color:#625a4d; font-size:11px">Check the browser console for the full error \u2014 this message exists so a failure is never silent.</div>
      </div>
    `;
  }
}

boot();
