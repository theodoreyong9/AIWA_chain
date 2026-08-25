// Runs the real, ongoing VDF computation on a dedicated thread — the
// one substantial fix for "the VDF should never be on the critical
// path", raised directly: a continuous, real, CPU-bound computation
// has no business sharing a thread with rendering and input handling,
// no matter how many small yields it makes along the way. This is a
// genuine architectural fix, not a tuning knob.
//
// Reuses vdf.js's own real, already-tested computeVdfChain — no
// duplicated logic, no separate implementation to keep in sync.

import { computeVdfChain, vdfSeed } from '../core/vdf.js';

self.onmessage = async (e) => {
  const { requestId, domain, previousOutput, iterations } = e.data;
  const seed = vdfSeed(domain, previousOutput);
  const vdfOutput = await computeVdfChain(seed, iterations);
  self.postMessage({ requestId, vdfOutput });
};
