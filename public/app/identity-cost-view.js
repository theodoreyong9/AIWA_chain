import { registerIdentityCost, initialIdentityCostState } from '../core/identity-cost.js';

// Real, recomputed from the DAG's own 'identity-cost' events — never
// cached or trusted from anywhere else. Shared so every panel that
// needs real burn amounts (Ignition's own display, Causal Tick's own
// weighting) sees the identical, real state.
export function deriveIdentityCostState(dag) {
  let s = initialIdentityCostState();
  for (const event of dag.topoOrder()) {
    if (event.payload?.type !== 'identity-cost') continue;
    const { domain, signature, burnedLamports, slot } = event.payload;
    const tx = { signature, err: null, incineratorBalanceDeltaLamports: burnedLamports, commitment: 'finalized', slot: slot ?? null };
    const result = registerIdentityCost(s, { domain, tx });
    if (result.accepted) s = result.state;
  }
  return s;
}
