export const state = {
  keypair: null,
  domainId: null,
  dag: null,
  genesisId: null,
  lastEventId: null, // real causal chaining — every new event should reference this, not always genesisId
  activeTab: 'continuum',
  wallet: null, // last materialized wallet state (public/core/wallet.js)
  mirror: null, // last materialized mirror state
  identityCost: null, // last materialized identity-cost state — real burns, the real weight source for causalTick
  causalTick: null, // this domain's own externally-corroborated position, or null if no real evidence exists yet
  mirrorEpoch: 0, // this domain's own real reception-commitment sequence number — distinct from progression epoch, incremented once per real, signed commitment
  lastEpochAt: 0,
  busy: {},
};

export const REWARD_PARAMS = { alpha: 1.1, beta: 2.2, gamma: 3, C: Math.pow(33, 3), minQ: 1 };
export const VDF_ITERATIONS = 12000; // real, measured ~280ms per epoch — felt, not instant, not minutes

let listeners = [];
export function onStateChange(fn) {
  listeners.push(fn);
}
export function notify() {
  for (const fn of listeners) fn();
}

export function short(id, length = 8) {
  return id ? `${id.slice(0, length)}\u2026` : '';
}
