// Runs the real, ongoing VDF computation — and, on request, real VDF
// verification too — on a dedicated thread. A continuous, real,
// CPU-bound computation has no business sharing a thread with
// rendering and input handling, no matter how many small yields it
// makes along the way. The same real reasoning applies to a large,
// one-time catch-up backlog of verification work at boot, not just
// the ongoing per-epoch computation.
//
// Reuses vdf.js's own real, already-tested computeVdfChain and
// verifyVdfChain — no duplicated logic, no separate implementation to
// keep in sync.

import { computeVdfChain, verifyVdfChain, vdfSeed } from '../core/vdf.js';

self.onmessage = async (e) => {
  const { requestId, kind } = e.data;
  if (kind === 'verify') {
    const { seed, iterations, output } = e.data;
    const valid = await verifyVdfChain(seed, iterations, output);
    self.postMessage({ requestId, valid });
    return;
  }
  // Default: 'compute', the ongoing progression loop's own real work.
  const { domain, previousOutput, iterations } = e.data;
  const seed = vdfSeed(domain, previousOutput);
  const vdfOutput = await computeVdfChain(seed, iterations);
  self.postMessage({ requestId, vdfOutput });
};
