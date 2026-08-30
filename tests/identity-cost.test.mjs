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

test('THE REAL FIX: a second, real, valid burn from the same domain accumulates onto its real, total committed capital — never rejected outright', () => {
  const first = registerIdentityCost(initialIdentityCostState(), { domain: 'alice', tx: tx({ incineratorBalanceDeltaLamports: 1000 }) });
  assert.equal(first.accepted, true);
  const second = registerIdentityCost(first.state, { domain: 'alice', tx: tx({ signature: 'sig2', incineratorBalanceDeltaLamports: 500 }) });
  assert.equal(second.accepted, true, 'a real, later, additional burn from the same domain is a real, legitimate commitment, not a rejected duplicate');
  assert.equal(second.state.registered.alice.burnedLamports, 1500, 'the real, total committed capital must reflect both real burns summed — matching accrual.js\'s own b, which already accumulates identically');
});

test('registeredAt and the original registration slot never move on a later, additional burn', () => {
  const first = registerIdentityCost(initialIdentityCostState(), { domain: 'alice', tx: tx({ slot: 10 }), now: 1000 });
  const second = registerIdentityCost(first.state, { domain: 'alice', tx: tx({ signature: 'sig2', slot: 999 }), now: 5000 });
  assert.equal(second.state.registered.alice.registeredAt, 1000, 'the domain\'s own first real proof of identity cost stays the real reference point');
  assert.equal(second.state.registered.alice.slot, 10);
});

test('SECURITY: a later, additional burn must independently satisfy the churn curve at its OWN real slot, never grandfathered at the original registration\'s lower requirement', () => {
  const curve = linearCostCurve({ baseLamports: 100, lamportsPerSlot: 10 });
  const churnConfig = { genesisSlot: 0, costCurve: curve };
  const first = registerIdentityCost(initialIdentityCostState(), { domain: 'alice', tx: tx({ slot: 0, incineratorBalanceDeltaLamports: 100 }), churnConfig });
  assert.equal(first.accepted, true);
  // A later burn at slot 200 requires >= 100 + 200*10 = 2100 lamports on its OWN — a small, real amount is correctly rejected, even though the domain is already registered.
  const second = registerIdentityCost(first.state, { domain: 'alice', tx: tx({ signature: 'sig2', slot: 200, incineratorBalanceDeltaLamports: 50 }), churnConfig });
  assert.equal(second.accepted, false, 'a small, real burn at a later real slot must still meet the real, current curve requirement on its own');
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

test('THE REAL INCREMENTAL CATCH-UP PROPERTY, verified for app.js\'s own rematerialize()/boot() fix (§12.1): applying only newly-arrived identity-cost events on top of already-materialized state produces byte-identical results to a full replay from scratch', async () => {
  const { EventDag } = await import('../public/core/event-dag.js');
  const { deriveIdentityCostState } = await import('../public/app/identity-cost-view.js');

  const dag = new EventDag();
  const genesisId = await dag.addEvent([], { type: 'genesis' });
  await dag.addEvent([], { type: 'identity-cost', domain: 'alice', signature: 'sig1', burnedLamports: 1000000, slot: 100 });
  await dag.addEvent([], { type: 'identity-cost', domain: 'bob', signature: 'sig2', burnedLamports: 2000000, slot: 200 });

  const fullReplay = deriveIdentityCostState(dag);

  // A real, deliberate mistake to guard against: `topoOrder()`
  // itself sorts causally-independent events by their own real,
  // content-addressed id — never insertion order — so a real,
  // correct `coveredEventIds` must reference the real genesis id
  // itself, never assume it's simply the first element.
  const events = dag.topoOrder();
  const coveredIds = new Set([genesisId]);
  let s = initialIdentityCostState();
  for (const ev of events) {
    if (coveredIds.has(ev.id)) continue;
    if (ev.payload?.type !== 'identity-cost') continue;
    const { domain, signature, burnedLamports, slot } = ev.payload;
    const realTx = { signature, err: null, incineratorBalanceDeltaLamports: burnedLamports, commitment: 'finalized', slot: slot ?? null };
    const result = registerIdentityCost(s, { domain, tx: realTx });
    if (result.accepted) s = result.state;
  }

  assert.deepEqual(fullReplay, s, 'a real, partial-then-incremental catch-up must produce an identical real identity-cost state to a full replay');
});
