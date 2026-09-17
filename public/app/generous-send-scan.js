// Pure, real scanning logic for generous-transfer.js's own real
// events (§15) — no browser dependency at all (no IndexedDB, no
// Worker, no DOM), so this, unlike most of app.js, is directly
// testable in Node. app.js itself only ever calls into this.
//
// The two "which ids has this domain's own progression already
// consumed" scans below are both the same general primitive — see
// core/contract-scan.js, shared with matching-contract-scan.js.

import { collectProgressionParentIds } from '../core/contract-scan.js';

export function scanForPendingGenerousSends(events, domainId) {
  const includedOfferIds = collectProgressionParentIds(events, { domain: domainId });
  const pending = {};
  for (const ev of events) {
    if (ev.payload?.type === 'generous-send-offer' && ev.payload?.commitment?.to === domainId && !includedOfferIds.has(ev.id)) {
      pending[ev.id] = ev.payload;
    }
  }
  return pending;
}

/** Real generous-send-offer events THIS domain has itself sent — found by the real donor's own signerPubkey on the commitment, never assumed from anywhere else. */
export function scanForSentGenerousSends(events, keypairPubkeyHex) {
  const sent = {};
  for (const ev of events) {
    if (ev.payload?.type === 'generous-send-offer' && ev.payload?.commitment?.signerPubkey === keypairPubkeyHex) {
      sent[ev.id] = ev.payload;
    }
  }
  return sent;
}

/**
 * A real win produces a real, findable contract-payout event
 * referencing the offer — a real loss produces nothing at all, so it
 * can only ever be inferred, never asserted, by having actually
 * received (synced) the real recipient's own progression event that
 * included the offer as a real parent, with no matching payout
 * following. Until that real evidence exists, an offer stays
 * 'pending' — never guessed at from elapsed time.
 */
export function scanSentGenerousSendOutcomes(events, sentOfferIds) {
  const qualifyingEpochSeen = collectProgressionParentIds(events, { only: sentOfferIds });
  const wonOfferIds = new Set();
  for (const ev of events) {
    if (ev.payload?.type === 'contract-payout' && sentOfferIds.has(ev.payload?.generousSendEventId)) {
      wonOfferIds.add(ev.payload.generousSendEventId);
    }
  }
  const outcomes = {};
  for (const offerId of sentOfferIds) {
    if (wonOfferIds.has(offerId)) outcomes[offerId] = 'won';
    else if (qualifyingEpochSeen.has(offerId)) outcomes[offerId] = 'lost';
    else outcomes[offerId] = 'pending';
  }
  return outcomes;
}
