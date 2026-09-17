// Pure, real scanning logic for relative-rate.js's own real witness
// events (§14) — no browser dependency, directly testable in Node.

import { groupEventsByKey } from '../core/contract-scan.js';

/**
 * Real rate-witness events this domain has itself published, grouped
 * by real target domain, in the real order they were published
 * (topoOrder's own real, deterministic order) — never re-sorted by
 * anything else. Delegates to the same generic grouping primitive
 * used by matching-contract-scan.js, in core/contract-scan.js.
 */
export function scanOwnRateWitnesses(events, observerDomain) {
  return groupEventsByKey(events, {
    predicate: (ev) => ev.payload?.type === 'rate-witness' && ev.payload?.observer === observerDomain,
    keyOf: (ev) => ev.payload.target,
  });
}
