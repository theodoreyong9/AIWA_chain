// Identity activation cost: a real, irrecoverable SOL burn to Solana's
// well-known incinerator address. A burn, not a bond: its protection
// doesn't depend on later enforcement (slashing) ever propagating,
// which matters for a protocol that must keep working through
// arbitrarily long partitions.
//
// This module verifies an already-fetched, normalized transaction
// record — it never touches the network itself.

export const SOLANA_INCINERATOR_ADDRESS = '1nc1nerator11111111111111111111111111111111';

export function initialIdentityCostState() {
  return { registered: {}, usedSignatures: {} };
}

// A deployment-chosen cost curve: burn lamports required as a function
// of slots elapsed since the deployment's own genesis slot. Optional —
// closes a churn attack where abandoning an aged domain for a fresh
// one would otherwise cost nothing beyond the ordinary burn.
export function linearCostCurve({ baseLamports, lamportsPerSlot }) {
  return (slotsSinceGenesis) => baseLamports + Math.max(0, slotsSinceGenesis) * lamportsPerSlot;
}

export function requiredBurnLamports(registrationSlot, genesisSlot, costCurve) {
  if (registrationSlot === null || registrationSlot === undefined || !Number.isFinite(registrationSlot)) return 0;
  return costCurve(Math.max(0, registrationSlot - genesisSlot));
}

export function verifyBurnProof(tx, { minLamports = 0 } = {}) {
  if (tx.err !== null) return { valid: false, reason: 'transaction failed on-chain' };
  if (tx.commitment !== 'finalized') return { valid: false, reason: `commitment is '${tx.commitment}', not 'finalized'` };
  if (!Number.isFinite(tx.incineratorBalanceDeltaLamports) || tx.incineratorBalanceDeltaLamports <= 0) {
    return { valid: false, reason: 'no positive burn detected' };
  }
  if (tx.incineratorBalanceDeltaLamports < minLamports) {
    return { valid: false, reason: `burned ${tx.incineratorBalanceDeltaLamports} lamports, need >= ${minLamports}` };
  }
  return { valid: true };
}

export function registerIdentityCost(state, { domain, tx, minLamports = 0, now = Date.now(), churnConfig } = {}) {
  if (state.usedSignatures[tx.signature]) {
    return { state, accepted: false, reason: `signature ${tx.signature} already used` };
  }
  if (state.registered[domain]) {
    return { state, accepted: false, reason: `domain '${domain}' already registered` };
  }

  let effectiveMinLamports = minLamports;
  if (churnConfig) {
    const required = requiredBurnLamports(tx.slot ?? null, churnConfig.genesisSlot, churnConfig.costCurve);
    effectiveMinLamports = Math.max(minLamports, required);
  }

  const check = verifyBurnProof(tx, { minLamports: effectiveMinLamports });
  if (!check.valid) return { state, accepted: false, reason: check.reason };

  return {
    state: {
      registered: { ...state.registered, [domain]: { domain, signature: tx.signature, burnedLamports: tx.incineratorBalanceDeltaLamports, registeredAt: now, slot: tx.slot ?? null } },
      usedSignatures: { ...state.usedSignatures, [tx.signature]: true },
    },
    accepted: true,
  };
}

export function hasIdentityCost(state, domain) {
  return Boolean(state.registered[domain]);
}
