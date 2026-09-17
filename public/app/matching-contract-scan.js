// Pure, real scanning logic for matching-contract.js's own real
// events — no browser dependency, directly testable in Node. Both
// scans below delegate to the two general primitives in
// core/contract-scan.js, shared with generous-send-scan.js and
// relative-rate-scan.js.

import { collectProgressionParentIds, groupEventsByKey } from '../core/contract-scan.js';

/**
 * Every real match-commitment event still genuinely pending — a real
 * commitment is spent (removed) the moment the wrapped offer it
 * references is actually resolved (win or lose), tracked by the real
 * progression loop, never here. Grouped by the real, wrapped offer's
 * own event id — the exact moment that offer resolves is the exact
 * moment every match referencing it needs to be checked too.
 */
export function scanPendingMatchCommitments(events, resolvedOfferIds) {
  return groupEventsByKey(events, {
    predicate: (ev) =>
      ev.payload?.type === 'match-commitment' &&
      !!ev.payload?.matchCommitment?.wrappedGenerousSendEventId &&
      !resolvedOfferIds.has(ev.payload.matchCommitment.wrappedGenerousSendEventId), // already resolved — this real match had its one, real chance already
    keyOf: (ev) => ev.payload.matchCommitment.wrappedGenerousSendEventId,
    itemOf: (ev) => ({ id: ev.id, ...ev.payload }),
  });
}

/**
 * Every real offer id that has already been included as a parent of
 * ANY real progression event, for ANY domain — a real match
 * commitment referencing an already-resolved offer is stale, never
 * re-eligible.
 */
export function scanResolvedOfferIds(events) {
  return collectProgressionParentIds(events);
}
