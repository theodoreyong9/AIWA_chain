// One real interface: Evidence -> Causal Tick, or an honest null when
// evidence is insufficient. "Local" and "cross-domain" are not two
// separate mechanisms — the identical function, given more evidence
// (a newly-imported domain's history, a newly-signed reception
// commitment), simply produces a more refined result. There is no
// second synchronization protocol for when a partition reconnects;
// there is only this same function seeing more of what already
// exists.
//
// A domain's own progression epoch (progression.js) remains the real,
// unconditional source of truth for its own accrual — bound by a real
// VDF, secure even with zero external observers. This file adds a
// complementary view: what OTHER domains, weighted by their own real
// committed capital (identity-cost.js), corroborate about a domain's
// position.
//
// Hardware attestation (hardware-attestation.js) is fully OPTIONAL —
// AIWA's evidence interface works with software primitives alone.
// When present, it is reported as a SEPARATE, additional confidence
// signal (hardwareBackedWeight, hardwareBackedObservers) — it never
// gates participation, never scales weight, never becomes a required
// input. A domain backed by zero hardware attestations produces an
// identical Causal Tick value to one backed by many; only the
// reported confidence signal differs.

import { deriveSourceEpochLookup } from './mirror.js';
import { weightedMedian } from './weighted-median.js';
import { isIndependenceAttested } from './hardware-attestation.js';

/**
 * @param {ReturnType<typeof import('./mirror.js').initialMirrorState>} mirrorState
 * @param {ReturnType<typeof import('./identity-cost.js').initialIdentityCostState>} identityCostState
 * @param {Array<{id: string, parents: string[], payload: any}>} orderedEvents
 * @param {string} targetDomain
 * @param {Record<string, Array<{issuance: object, binding: object}>>} [hardwareAttestations] optional, keyed by observer domain
 * @returns {Promise<{ tick: number, interval: [number, number], totalWeight: number, observationCount: number, hardwareBackedWeight: number, hardwareBackedObservers: number } | null>} null (bottom) if no real evidence exists yet
 */
export async function computeCausalTick(mirrorState, identityCostState, orderedEvents, targetDomain, hardwareAttestations = {}) {
  const sourceEpochLookup = deriveSourceEpochLookup(orderedEvents);
  const estimates = [];
  let totalWeight = 0;
  let hardwareBackedWeight = 0;
  let hardwareBackedObservers = 0;

  for (const [observerDomain, commitments] of Object.entries(mirrorState.commitments)) {
    if (observerDomain === targetDomain) continue; // a domain corroborating itself is not external evidence
    const weight = identityCostState.registered[observerDomain]?.burnedLamports ?? 0;
    if (!(weight > 0)) continue; // no real committed capital — no real weight

    let observerContributed = false;
    for (const commitment of commitments) {
      for (const ref of commitment.receivedFrom) {
        if (ref.sourceDomain !== targetDomain) continue;
        const epoch = sourceEpochLookup(targetDomain, ref.eventId);
        if (epoch === null) continue; // a claimed reference that does not resolve to a real event — ignored, not trusted
        estimates.push({ value: epoch, weight });
        totalWeight += weight;
        observerContributed = true;
      }
    }

    if (observerContributed) {
      // Reported, never consumed by the weighted median itself — an
      // informational signal about how much of the corroborating
      // weight also carries a stronger, optional independence
      // assurance.
      const attestations = hardwareAttestations[observerDomain];
      if (attestations && (await isIndependenceAttested(attestations, observerDomain))) {
        hardwareBackedWeight += weight;
        hardwareBackedObservers += 1;
      }
    }
  }

  if (estimates.length === 0) return null; // bottom: insufficiently determined

  const values = estimates.map((e) => e.value);
  return {
    tick: weightedMedian(estimates),
    interval: [Math.min(...values), Math.max(...values)],
    totalWeight,
    observationCount: estimates.length,
    hardwareBackedWeight,
    hardwareBackedObservers,
  };
}

/**
 * The real security-relevant question: does a domain's own self-
 * reported epoch sit within a real, bounded distance of what weighted
 * external evidence corroborates? A large gap is a real, honest
 * signal to surface — never proof of dishonesty by itself (a domain
 * legitimately far ahead of its own, still-catching-up observers
 * looks identical to one that fabricated progression no one has
 * corroborated yet).
 *
 * @param {number} selfReportedEpoch
 * @param {Awaited<ReturnType<typeof computeCausalTick>>} causalTick
 * @param {number} tolerance
 * @returns {{ consistent: boolean, gap: number | null }}
 */
export function checkCausalConsistency(selfReportedEpoch, causalTick, tolerance) {
  if (!causalTick) return { consistent: true, gap: null }; // no evidence yet — nothing to be inconsistent WITH
  const gap = Math.abs(selfReportedEpoch - causalTick.tick);
  return { consistent: gap <= tolerance, gap };
}
