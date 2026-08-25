import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialIdentityCostState, verifyBurnProof, registerIdentityCost, hasIdentityCost,
  linearCostCurve, requiredBurnLamports,
} from '../public/core/identity-cost.js';

function tx(overrides = {}) {
  return { signature: 'sig1', err: null, incineratorBalanceDeltaLamports: 1000, commitment: 'finalized', slot: 100, ...overrides };
}

test('a valid finalized burn is accepted with no minimum by default', () => {
  assert.equal(verifyBurnProof(tx()).valid, true);
});

test('a tiny burn (1 lamport) is accepted — no minimum by default', () => {
  assert.equal(verifyBurnProof(tx({ incineratorBalanceDeltaLamports: 1 })).valid, true);
});

test('a zero-lamport burn is rejected', () => {
  assert.equal(verifyBurnProof(tx({ incineratorBalanceDeltaLamports: 0 })).valid, false);
});

test('a failed on-chain transaction is rejected', () => {
  assert.equal(verifyBurnProof(tx({ err: { code: 1 } })).valid, false);
});

test('a non-finalized commitment is rejected', () => {
  assert.equal(verifyBurnProof(tx({ commitment: 'confirmed' })).valid, false);
});

test('minLamports is an optional per-deployment floor', () => {
  assert.equal(verifyBurnProof(tx({ incineratorBalanceDeltaLamports: 5 }), { minLamports: 10 }).valid, false);
  assert.equal(verifyBurnProof(tx({ incineratorBalanceDeltaLamports: 15 }), { minLamports: 10 }).valid, true);
});

test('registerIdentityCost accepts a valid burn', () => {
  const { state, accepted } = registerIdentityCost(initialIdentityCostState(), { domain: 'alice', tx: tx() });
  assert.equal(accepted, true);
  assert.equal(hasIdentityCost(state, 'alice'), true);
});

test('SECURITY: the same signature cannot back two different domains', () => {
  let { state } = registerIdentityCost(initialIdentityCostState(), { domain: 'alice', tx: tx() });
  const result = registerIdentityCost(state, { domain: 'bob', tx: tx() });
  assert.equal(result.accepted, false);
});

test('a domain cannot register a second identity cost once it already has one', () => {
  let { state } = registerIdentityCost(initialIdentityCostState(), { domain: 'alice', tx: tx() });
  const result = registerIdentityCost(state, { domain: 'alice', tx: tx({ signature: 'sig2' }) });
  assert.equal(result.accepted, false);
});

test('hasIdentityCost is false for an unregistered domain', () => {
  assert.equal(hasIdentityCost(initialIdentityCostState(), 'ghost'), false);
});

test('linearCostCurve is a pure, deterministic function of slots since genesis', () => {
  const curve = linearCostCurve({ baseLamports: 1000, lamportsPerSlot: 10 });
  assert.equal(curve(0), 1000);
  assert.equal(curve(100), 2000);
});

test('requiredBurnLamports computes purely locally', () => {
  const curve = linearCostCurve({ baseLamports: 1000, lamportsPerSlot: 10 });
  assert.equal(requiredBurnLamports(150, 100, curve), 1500);
});

test('requiredBurnLamports never penalizes a registration slot before genesis', () => {
  const curve = linearCostCurve({ baseLamports: 1000, lamportsPerSlot: 10 });
  assert.equal(requiredBurnLamports(50, 100, curve), 1000);
});

test('requiredBurnLamports returns 0 for a null slot — absent is never penalized beyond the caller floor', () => {
  const curve = linearCostCurve({ baseLamports: 1000, lamportsPerSlot: 10 });
  assert.equal(requiredBurnLamports(null, 100, curve), 0);
});

test('registerIdentityCost enforces the churn cost curve when supplied', () => {
  const curve = linearCostCurve({ baseLamports: 1000, lamportsPerSlot: 10 });
  const result = registerIdentityCost(initialIdentityCostState(), {
    domain: 'alice', tx: tx({ incineratorBalanceDeltaLamports: 500, slot: 150 }), churnConfig: { genesisSlot: 100, costCurve: curve },
  });
  assert.equal(result.accepted, false, '500 lamports is below the required 1500 at slot 150');
});

test('a burn meeting the churn curve requirement is accepted', () => {
  const curve = linearCostCurve({ baseLamports: 1000, lamportsPerSlot: 10 });
  const result = registerIdentityCost(initialIdentityCostState(), {
    domain: 'alice', tx: tx({ incineratorBalanceDeltaLamports: 1500, slot: 150 }), churnConfig: { genesisSlot: 100, costCurve: curve },
  });
  assert.equal(result.accepted, true);
});

test('an explicit minLamports floor and a churn curve compose — the higher applies', () => {
  const curve = linearCostCurve({ baseLamports: 100, lamportsPerSlot: 1 });
  const result = registerIdentityCost(initialIdentityCostState(), {
    domain: 'alice', tx: tx({ incineratorBalanceDeltaLamports: 5000, slot: 100 }), minLamports: 9999, churnConfig: { genesisSlot: 0, costCurve: curve },
  });
  assert.equal(result.accepted, false, 'the explicit 9999 floor exceeds both the burn and the curve');
});
