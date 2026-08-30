// Pure, real scanning logic for matching-contract.js's own real
// events — no browser dependency, directly testable in Node.

/**
 * Every real match-commitment event still genuinely pending — a real
 * commitment is spent (removed) the moment the wrapped offer it
 * references is actually resolved (win or lose), tracked by the real
 * progression loop, never here. Grouped by the real, wrapped offer's
 * own event id — the exact moment that offer resolves is the exact
 * moment every match referencing it needs to be checked too.
 */
export function scanPendingMatchCommitments(events, resolvedOfferIds) {
  const byWrappedOfferId = {};
  for (const ev of events) {
    if (ev.payload?.type !== 'match-commitment') continue;
    const wrappedId = ev.payload?.matchCommitment?.wrappedGenerousSendEventId;
    if (!wrappedId || resolvedOfferIds.has(wrappedId)) continue; // already resolved — this real match had its one, real chance already
    if (!byWrappedOfferId[wrappedId]) byWrappedOfferId[wrappedId] = [];
    byWrappedOfferId[wrappedId].push({ id: ev.id, ...ev.payload });
  }
  return byWrappedOfferId;
}

/**
 * Every real offer id that has already been included as a parent of
 * ANY real progression event, for ANY domain — a real match
 * commitment referencing an already-resolved offer is stale, never
 * re-eligible.
 */
export function scanResolvedOfferIds(events) {
  const resolved = new Set();
  for (const ev of events) {
    if (ev.payload?.type === 'progression') {
      for (const p of ev.parents) resolved.add(p);
    }
  }
  return resolved;
}
