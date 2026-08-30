// Pure, real scanning logic for relative-rate.js's own real witness
// events (§14) — no browser dependency, directly testable in Node.

/**
 * Real rate-witness events this domain has itself published, grouped
 * by real target domain, in the real order they were published
 * (topoOrder's own real, deterministic order) — never re-sorted by
 * anything else.
 */
export function scanOwnRateWitnesses(events, observerDomain) {
  const byTarget = {};
  for (const ev of events) {
    if (ev.payload?.type === 'rate-witness' && ev.payload?.observer === observerDomain) {
      const target = ev.payload.target;
      if (!byTarget[target]) byTarget[target] = [];
      byTarget[target].push(ev.payload);
    }
  }
  return byTarget;
}
