import { EventDag } from '../core/event-dag.js';
import { createPersistedDag } from './persistence.js';
import { materializeWallet, applyWalletEvent } from '../core/wallet.js';
import { materializeMirror, deriveSourceEpochLookup } from '../core/mirror.js';
import { computeCausalTick } from '../core/causal-tick.js';
import { deriveIdentityCostState } from './identity-cost-view.js';
import { vdfSeed, computeVdfChain } from '../core/vdf.js';
import { state, REWARD_PARAMS, VDF_ITERATIONS, notify } from './state.js';
import { renderContinuum } from './continuum.js';
import { renderIgnition } from './ignition.js';
import { renderMirror } from './mirror-view.js';

const DB_NAME = 'aiwa-chain-local';

async function rematerialize() {
  const events = state.dag.topoOrder();
  state.wallet = await materializeWallet(REWARD_PARAMS, events);
  const lookup = deriveSourceEpochLookup(events);
  state.mirror = await materializeMirror(events, lookup);
  state.identityCost = deriveIdentityCostState(state.dag);
  state.causalTick = state.domainId ? await computeCausalTick(state.mirror, state.identityCost, events, state.domainId) : null;
  notify();
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
    const seed = vdfSeed(domain, previousOutput);
    const vdfOutput = await computeVdfChain(seed, VDF_ITERATIONS);
    if (!state.keypair || state.domainId !== domain) break; // identity changed mid-computation — discard, do not misattribute
    const payload = { type: 'progression', domain, epoch, vdfIterations: VDF_ITERATIONS, vdfOutput };
    const newId = await state.dag.addEvent([lastId], payload);
    state.lastEventId = newId;
    state.lastEpochAt = Date.now();
    // A real, incremental update — apply just this ONE new event to
    // the already-materialized wallet state, rather than re-folding
    // and re-verifying the domain's entire progression history again.
    // A full rematerialize() here, every single epoch, would make each
    // new epoch re-verify every prior one too — real O(n^2) work over
    // a session, growing without bound the longer this loop runs. Mirror,
    // identity-cost, and the causal tick are unaffected by this
    // domain's own progression advancing, so they are left as they are;
    // they still get a real, full refresh after any reconciliation or
    // other action via rematerialize() itself.
    state.wallet = await applyWalletEvent(REWARD_PARAMS, state.wallet, { id: newId, parents: [lastId], payload });
    notify();
    // A real, explicit yield between epochs too — belt and suspenders
    // alongside vdf.js's own internal yields, so the browser always
    // gets a real chance to paint, handle input, and process a reload
    // request between one epoch finishing and the next beginning.
    await new Promise((resolve) => setTimeout(resolve, 0));
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
  const showProgress = (done, total) => {
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    root.innerHTML = `
      <div style="padding:60px 20px; text-align:center; font-family:monospace; color:#948a7a">
        <div style="font-size:13px">Verifying real, historical progression\u2026</div>
        <div style="width:200px; height:4px; background:#262119; border-radius:2px; margin:16px auto; overflow:hidden">
          <div style="width:${pct}%; height:100%; background:#c98a3e; transition:width 0.15s"></div>
        </div>
        <div style="font-size:11px; color:#625a4d">${done} / ${total} real events \u2014 each past epoch checked once, never skipped</div>
      </div>
    `;
  };
  showProgress(0, 0);
  try {
    const dag = new EventDag();
    state.dag = await createPersistedDag(DB_NAME, dag);
    state.genesisId = await state.dag.addEvent([], { type: 'genesis' });
    state.lastEventId = state.genesisId;
    const events = state.dag.topoOrder();
    state.wallet = await materializeWallet(REWARD_PARAMS, events, showProgress);
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
