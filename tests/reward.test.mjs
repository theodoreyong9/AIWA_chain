import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reward, RewardError, elapsedEpochs, domainAge } from '../public/core/reward.js';

const params = { alpha: 1.1, beta: 2.2, gamma: 3, C: Math.pow(33, 3), minQ: 1 };

test('q below minQ yields zero — no instant reward', () => {
  assert.equal(reward(10, 0, 1, 0, params), 0);
});

test('q at or above minQ yields a positive reward for positive b', () => {
  assert.ok(reward(10, 1, 1, 0, params) > 0);
});

test('reward grows monotonically with q — cumulative, not a flat rate', () => {
  const r1 = reward(10, 1, 1, 0, params);
  const r5 = reward(10, 5, 5, 0, params);
  const r10 = reward(10, 10, 10, 0, params);
  assert.ok(r5 > r1);
  assert.ok(r10 > r5);
});

test('larger b scales the numerator linearly, all else equal', () => {
  const r1 = reward(10, 5, 5, 0, params);
  const r2 = reward(20, 5, 5, 0, params);
  assert.ok(Math.abs(r2 / r1 - 2) < 1e-9);
});

test('patience rate is clamped to [0, 0.4]', () => {
  const rNeg = reward(10, 5, 5, -1, params);
  const rZero = reward(10, 5, 5, 0, params);
  assert.equal(rNeg, rZero);
  const rHigh = reward(10, 5, 5, 10, params);
  const rClamped = reward(10, 5, 5, 0.4, params);
  assert.equal(rHigh, rClamped);
});

test('negative b, q, or qTotal are rejected', () => {
  assert.throws(() => reward(-1, 1, 1, 0, params), RewardError);
  assert.throws(() => reward(1, -1, 1, 0, params), RewardError);
  assert.throws(() => reward(1, 1, -1, 0, params), RewardError);
});

test('non-finite params are rejected', () => {
  assert.throws(() => reward(1, 1, 1, 0, { ...params, alpha: NaN }), RewardError);
});

test('reward never returns a negative or non-finite number for valid finite inputs', () => {
  const r = reward(1e6, 1e6, 1e6, 0.2, params);
  assert.ok(Number.isFinite(r));
  assert.ok(r >= 0);
});

test('elapsedEpochs reads the current domain epoch relative to q0', () => {
  const state = { domains: { d: { epoch: 7 } } };
  assert.equal(elapsedEpochs(state, 'd', 2), 5);
});

test('elapsedEpochs never goes negative', () => {
  const state = { domains: { d: { epoch: 2 } } };
  assert.equal(elapsedEpochs(state, 'd', 10), 0);
});

test('elapsedEpochs for an unknown domain is zero', () => {
  assert.equal(elapsedEpochs({ domains: {} }, 'ghost', 0), 0);
});

test('domainAge reads the domain current epoch, zero for unknown', () => {
  assert.equal(domainAge({ domains: { d: { epoch: 4 } } }, 'd'), 4);
  assert.equal(domainAge({ domains: {} }, 'ghost'), 0);
});
