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
let eventsSinceSnapshot = 0;

// The real, ongoing VDF computation runs on a dedicated worker thread
// — see vdf-worker.js's own header for why. One worker, reused across
// every epoch; a request/response pattern (rather than one-shot
// worker-per-epoch) avoids real, repeated worker start-up cost.
let vdfWorker = null;
let requestCounter = 0;
const pendingRequests = new Map();

function getVdfWorker() {
  if (!vdfWorker) {
    vdfWorker = new Worker(new URL('./vdf-worker.js', import.meta.url), { type: 'module' });
    vdfWorker.onmessage = (e) => {
      const { requestId, vdfOutput } = e.data;
      const resolve = pendingRequests.get(requestId);
      if (resolve) {
        pendingRequests.delete(requestId);
        resolve(vdfOutput);
      }
    };
  }
  return vdfWorker;
}

function computeVdfOnWorker(domain, previousOutput, iterations) {
  const worker = getVdfWorker();
  const requestId = ++requestCounter;
  return new Promise((resolve) => {
    pendingRequests.set(requestId, resolve);
    worker.postMessage({ requestId, domain, previousOutput, iterations });
  });
}

async function rematerialize() {
  const events = state.dag.topoOrder();
  state.wallet = await materializeWallet(REWARD_PARAMS, events);
  const lookup = deriveSourceEpochLookup(events);
  state.mirror = await materializeMirror(events, lookup);
  state.identityCost = deriveIdentityCostState(state.dag);
  state.causalTick = state.domainId ? await computeCausalTick(state.mirror, state.identityCost, events, state.domainId) : null;
  notify();
  maybeSnapshot(events);
}

// Saves a real snapshot every 25 events — frequent enough that a
// reload never has much real backlog left to re-verify, infrequent
// enough not to add real, felt overhead to every single epoch.
function maybeSnapshot(events) {
  eventsSinceSnapshot += 1;
  if (eventsSinceSnapshot < 25) return;
  eventsSinceSnapshot = 0;
  const last = events[events.length - 1];
  if (last) saveSnapshot(last.id, events.length, state.wallet).catch((err) => console.error('Snapshot save failed:', err));
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
    // full duration of each epoch, not just during vdf.js's own
    // internal yields.
    const vdfOutput = await computeVdfOnWorker(domain, previousOutput, VDF_ITERATIONS);
    if (!state.keypair || state.domainId !== domain) break; // identity changed mid-computation — discard, do not misattribute
    const payload = { type: 'progression', domain, epoch, vdfIterations: VDF_ITERATIONS, vdfOutput };
    const newId = await state.dag.addEvent([lastId], payload);
    state.lastEventId = newId;
    state.lastEpochAt = Date.now();
    // A real, incremental update — apply just this ONE new event to
    // the already-materialized wallet state, rather than re-folding
    // and re-verifying the domain's entire progression history again.
    state.wallet = await applyWalletEvent(REWARD_PARAMS, state.wallet, { id: newId, parents: [lastId], payload });
    notify();
    maybeSnapshot(state.dag.topoOrder());
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

    // A real, verified snapshot — trusted only if its recorded head
    // event genuinely appears at the exact prefix length it claims,
    // in THIS real, current topological order. Any mismatch (a
    // reordering from an import, corruption, anything unexpected)
    // discards it entirely rather than risking silently-wrong state.
    const snapshot = await loadSnapshot();
    let startIndex = 0;
    if (snapshot) {
      const headIndex = events.findIndex((e) => e.id === snapshot.headEventId);
      if (headIndex !== -1 && headIndex === snapshot.eventCount - 1) {
        state.wallet = snapshot.wallet;
        startIndex = headIndex + 1;
      }
    }

    const remaining = events.slice(startIndex);
    if (remaining.length > 0) {
      showProgress(0, remaining.length, startIndex > 0 ? 'Catching up since last snapshot\u2026' : 'Verifying real, historical progression\u2026');
      let base = state.wallet ?? initialWalletState();
      for (let i = 0; i < remaining.length; i++) {
        base = await applyWalletEvent(REWARD_PARAMS, base, remaining[i]);
        if (i % 20 === 0) showProgress(i + 1, remaining.length, startIndex > 0 ? 'Catching up since last snapshot\u2026' : 'Verifying real, historical progression\u2026');
      }
      state.wallet = base;
    } else if (!state.wallet) {
      state.wallet = initialWalletState();
    }

    const lookup = deriveSourceEpochLookup(events);
    state.mirror = await materializeMirror(events, lookup);
    state.identityCost = deriveIdentityCostState(state.dag);
    state.causalTick = state.domainId ? await computeCausalTick(state.mirror, state.identityCost, events, state.domainId) : null;
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

export { rematerialize };
