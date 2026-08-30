import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForPendingGenerousSends, scanForSentGenerousSends, scanSentGenerousSendOutcomes } from '../public/app/generous-send-scan.js';

function offerEvent(id, to, signerPubkey, extra = {}) {
  return { id, parents: [], payload: { type: 'generous-send-offer', commitment: { to, signerPubkey, ...extra } } };
}
function progressionEvent(id, domain, parents) {
  return { id, parents, payload: { type: 'progression', domain } };
}
function payoutEvent(id, generousSendEventId, parents = []) {
  return { id, parents, payload: { type: 'contract-payout', generousSendEventId } };
}

test('scanForPendingGenerousSends finds a real offer addressed to this domain, not yet included', () => {
  const events = [offerEvent('offer-1', 'bob', 'alice-pubkey')];
  const pending = scanForPendingGenerousSends(events, 'bob');
  assert.deepEqual(Object.keys(pending), ['offer-1']);
});

test('scanForPendingGenerousSends excludes an offer already included as a real parent of this domain\'s own progression', () => {
  const events = [
    offerEvent('offer-1', 'bob', 'alice-pubkey'),
    progressionEvent('epoch-1', 'bob', ['prior', 'offer-1']),
  ];
  const pending = scanForPendingGenerousSends(events, 'bob');
  assert.deepEqual(Object.keys(pending), []);
});

test('scanForPendingGenerousSends ignores real offers addressed to a different domain', () => {
  const events = [offerEvent('offer-1', 'charlie', 'alice-pubkey')];
  const pending = scanForPendingGenerousSends(events, 'bob');
  assert.deepEqual(Object.keys(pending), []);
});

test('scanForSentGenerousSends finds real offers signed by this real pubkey', () => {
  const events = [
    offerEvent('offer-1', 'bob', 'alice-pubkey'),
    offerEvent('offer-2', 'charlie', 'someone-else-pubkey'),
  ];
  const sent = scanForSentGenerousSends(events, 'alice-pubkey');
  assert.deepEqual(Object.keys(sent), ['offer-1']);
});

test('THE REAL DONOR-SIDE OUTCOME PROPERTY: a real win is found via a real, matching contract-payout event', () => {
  const events = [
    offerEvent('offer-1', 'bob', 'alice-pubkey'),
    progressionEvent('epoch-6', 'bob', ['epoch-5', 'offer-1']),
    payoutEvent('payout-1', 'offer-1', ['epoch-6']),
  ];
  const outcomes = scanSentGenerousSendOutcomes(events, new Set(['offer-1']));
  assert.equal(outcomes['offer-1'], 'won');
});

test('THE REAL DONOR-SIDE OUTCOME PROPERTY: a real loss is inferred from a real qualifying epoch with no matching payout', () => {
  const events = [
    offerEvent('offer-1', 'bob', 'alice-pubkey'),
    progressionEvent('epoch-6', 'bob', ['epoch-5', 'offer-1']),
  ];
  const outcomes = scanSentGenerousSendOutcomes(events, new Set(['offer-1']));
  assert.equal(outcomes['offer-1'], 'lost');
});

test('an offer with no real qualifying epoch seen yet stays honestly pending, never guessed at', () => {
  const events = [offerEvent('offer-1', 'bob', 'alice-pubkey')];
  const outcomes = scanSentGenerousSendOutcomes(events, new Set(['offer-1']));
  assert.equal(outcomes['offer-1'], 'pending');
});

test('SECURITY: a real payout for a DIFFERENT offer id never marks an unrelated offer as won', () => {
  const events = [
    offerEvent('offer-1', 'bob', 'alice-pubkey'),
    progressionEvent('epoch-6', 'bob', ['epoch-5', 'offer-1']),
    payoutEvent('payout-1', 'some-other-offer-id', ['epoch-6']),
  ];
  const outcomes = scanSentGenerousSendOutcomes(events, new Set(['offer-1']));
  assert.equal(outcomes['offer-1'], 'lost', 'a payout for a different offer must never be mistaken for this one\'s own real win');
});
