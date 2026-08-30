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
  importedDomains: new Set(), // domains genuinely brought in via a real reconciliation.js import — never a raw scan of local storage, which would also catch this browser's own earlier, disconnected-from identities
  lastEpochAt: 0,
  busy: {},
  // Real generous-send-offer events addressed to this domain, not yet
  // included as a parent of this domain's own next real epoch — see
  // generous-transfer.js (§15). Keyed by the real offer event's own
  // id; entries are removed once genuinely included (win or lose,
  // each real offer gets exactly one real chance).
  pendingGenerousSends: {},
  // Real generous-send-offer events THIS domain has itself sent, kept
  // to know what to keep checking on — never security-relevant,
  // purely for the UI to know what to look up.
  sentGenerousSends: {},
  // Real, known outcomes for this domain's own sent offers — keyed by
  // offer event id, value 'pending' | 'won' | 'lost'. 'lost' can only
  // ever be inferred by having actually received (synced) the real
  // recipient's own progression event that included the offer as a
  // parent, without a matching real payout following it — never
  // assumed just because time has passed.
  sentGenerousSendOutcomes: {},
  // Real, resolved generous sends this domain has been part of
  // (either side), kept for the UI — never re-consulted for security.
  generousSendHistory: [],
  // Real, own rate witnesses (§14) — keyed by real target domain,
  // each a real, signed, published event. Two or more, for the same
  // real target, let computeRelativeRate() derive a real relative
  // rate — never a clock, purely this domain's own repeated
  // observation of the same real target's own real epoch.
  rateWitnesses: {},
  // Real, still-pending matching-contract.js commitments (§15.1),
  // grouped by the real, wrapped offer id they reference — resolved
  // at the exact, same real moment the wrapped offer itself is,
  // never separately or on a different schedule.
  pendingMatchCommitments: {},
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
