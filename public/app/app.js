import { EventDag } from '../core/event-dag.js';
import { createPersistedDag } from './persistence.js';
import { materializeWallet } from '../core/wallet.js';
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
    const newId = await state.dag.addEvent([lastId], { type: 'progression', domain, epoch, vdfIterations: VDF_ITERATIONS, vdfOutput });
    state.lastEventId = newId;
    state.lastEpochAt = Date.now();
    await rematerialize();
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
  try {
    const dag = new EventDag();
    state.dag = await createPersistedDag(DB_NAME, dag);
    state.genesisId = await state.dag.addEvent([], { type: 'genesis' });
    state.lastEventId = state.genesisId;
    await rematerialize();
    render();
  } catch (err) {
    console.error('Boot failed:', err);
    const root = document.getElementById('app');
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
