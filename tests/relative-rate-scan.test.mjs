import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanOwnRateWitnesses } from '../public/app/relative-rate-scan.js';

function witnessEvent(id, observer, target, observerEpoch, targetEpoch) {
  return { id, parents: [], payload: { type: 'rate-witness', observer, target, observerEpoch, targetEpoch } };
}

test('scanOwnRateWitnesses finds real witnesses this domain published, grouped by real target', () => {
  const events = [
    witnessEvent('w1', 'alice', 'bob', 10, 100),
    witnessEvent('w2', 'alice', 'bob', 50, 180),
    witnessEvent('w3', 'alice', 'charlie', 5, 5),
  ];
  const byTarget = scanOwnRateWitnesses(events, 'alice');
  assert.equal(byTarget.bob.length, 2);
  assert.equal(byTarget.charlie.length, 1);
});

test('scanOwnRateWitnesses ignores real witnesses published by a different observer', () => {
  const events = [witnessEvent('w1', 'someone-else', 'bob', 10, 100)];
  const byTarget = scanOwnRateWitnesses(events, 'alice');
  assert.deepEqual(byTarget, {});
});

test('scanOwnRateWitnesses preserves real, deterministic publish order per target', () => {
  const events = [
    witnessEvent('w1', 'alice', 'bob', 10, 100),
    witnessEvent('w2', 'alice', 'bob', 50, 180),
  ];
  const byTarget = scanOwnRateWitnesses(events, 'alice');
  assert.equal(byTarget.bob[0].observerEpoch, 10);
  assert.equal(byTarget.bob[1].observerEpoch, 50);
});
