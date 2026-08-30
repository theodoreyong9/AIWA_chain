// Pure, real scanning logic for generous-transfer.js's own real
// events (§15) — no browser dependency at all (no IndexedDB, no
// Worker, no DOM), so this, unlike most of app.js, is directly
// testable in Node. app.js itself only ever calls into this.

export function scanForPendingGenerousSends(events, domainId) {
  const includedOfferIds = new Set();
  for (const ev of events) {
    if (ev.payload?.type === 'progression' && ev.payload?.domain === domainId) {
      for (const p of ev.parents) includedOfferIds.add(p);
    }
  }
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
  const qualifyingEpochSeen = new Set();
  const wonOfferIds = new Set();
  for (const ev of events) {
    if (ev.payload?.type === 'progression') {
      for (const p of ev.parents) {
        if (sentOfferIds.has(p)) qualifyingEpochSeen.add(p);
      }
    }
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
