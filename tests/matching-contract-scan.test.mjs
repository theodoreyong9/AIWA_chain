import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanPendingMatchCommitments, scanResolvedOfferIds } from '../public/app/matching-contract-scan.js';

function matchEvent(id, wrappedGenerousSendEventId, extra = {}) {
  return { id, parents: [], payload: { type: 'match-commitment', matchCommitment: { wrappedGenerousSendEventId, ...extra } } };
}
function progressionEvent(id, domain, parents) {
  return { id, parents, payload: { type: 'progression', domain } };
}

test('scanResolvedOfferIds finds every real offer id already included as a real parent of any progression event', () => {
  const events = [progressionEvent('e1', 'bob', ['prior', 'offer-1']), progressionEvent('e2', 'alice', ['prior2', 'offer-2'])];
  const resolved = scanResolvedOfferIds(events);
  assert.equal(resolved.has('offer-1'), true);
  assert.equal(resolved.has('offer-2'), true);
  assert.equal(resolved.has('offer-3'), false);
});

test('scanPendingMatchCommitments groups real, still-pending matches by their real, wrapped offer id', () => {
  const events = [matchEvent('m1', 'offer-1'), matchEvent('m2', 'offer-1'), matchEvent('m3', 'offer-2')];
  const pending = scanPendingMatchCommitments(events, new Set());
  assert.equal(pending['offer-1'].length, 2);
  assert.equal(pending['offer-2'].length, 1);
});

test('scanPendingMatchCommitments excludes a real match whose wrapped offer has already been resolved', () => {
  const events = [matchEvent('m1', 'offer-1')];
  const pending = scanPendingMatchCommitments(events, new Set(['offer-1']));
  assert.deepEqual(pending, {}, 'a real match referencing an already-resolved offer must never be treated as pending — its one, real chance is already spent');
});
