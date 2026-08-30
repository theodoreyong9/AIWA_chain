import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVdfChain, vdfSeed } from '../public/core/vdf.js';
import { deriveDomainId } from '../public/core/domain-id.js';
import { EventDag } from '../public/core/event-dag.js';
import { checkCausalConsistency } from '../public/core/causal-tick.js';
import { evaluate, verify as verifyWesolowski } from '../public/core/wesolowski-vdf.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { computeOutcomeHash, checkOutcome } from '../public/core/generous-transfer.js';
import { weightedMedian } from '../public/core/weighted-median.js';

// A real, independent Rust implementation (interop/rust-vdf) of the
// identical, real specification vdf.js and domain-id.js implement —
// never a wrapper or transpilation of the JS. This test builds and
// runs the real Rust binary, then compares its real output against
// the real JS module's own output for the identical test vectors,
// byte for byte. This is the concrete demonstration the Yellow
// Paper's own §24 (multi-runtime interoperability) needs to be more
// than an assertion — a real, ongoing, re-runnable check.
//
// SKIPPED, not failed, if no real Rust toolchain (cargo) is available
// — a missing optional toolchain in a given environment is a real,
// honest absence, never grounds to fail the rest of this project's
// own real test suite.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rustProjectDir = path.join(__dirname, '..', 'interop', 'rust-vdf');

function hasCargo() {
  try {
    execSync('cargo --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('THE REAL CROSS-RUNTIME PROPERTY: an independent Rust implementation produces byte-for-byte identical output to the real JS module, for the identical real test vectors', { skip: !hasCargo() && 'cargo not available in this environment' }, async () => {
  execSync('cargo build --release', { cwd: rustProjectDir, stdio: 'ignore' });
  const binaryPath = path.join(rustProjectDir, 'target', 'release', 'vdf-interop');
  assert.ok(existsSync(binaryPath), 'the real Rust binary must exist after a real, successful build');

  const rustOutput = JSON.parse(execSync(binaryPath, { encoding: 'utf8' }));

  // The identical real test vectors main.rs's own header documents.
  const vdf1 = await computeVdfChain(vdfSeed('earth-domain', 'genesis'), 500);
  const vdf2 = await computeVdfChain(vdfSeed('mars-domain', vdf1), 500);
  const vdf3 = await computeVdfChain(vdfSeed('earth-domain', 'genesis'), 12000);
  const domainId = await deriveDomainId(new Uint8Array(32).fill(7));

  assert.equal(rustOutput.vdf1, vdf1, 'a real, single-epoch VDF chain must match exactly across runtimes');
  assert.equal(rustOutput.vdf2, vdf2, 'a real, chained (epoch depends on prior real output) VDF chain must match exactly');
  assert.equal(rustOutput.vdf3, vdf3, 'a real, full-length (12000-iteration) VDF chain, matching this project\'s own real VDF_ITERATIONS, must match exactly');
  assert.equal(rustOutput.domainId, domainId, 'real domain-id derivation (SHA-256 of a public key) must match exactly across runtimes too');

  // §3.1's own real canonicalization — the literal foundation every
  // other section's "the same event" depends on. Verified here with a
  // real, non-trivial event: a nested payload, and parents given
  // deliberately out of order, so real sorting is actually exercised,
  // not just trivially passed through.
  const dag = new EventDag();
  const genesisId = await dag.addEvent([], { type: 'genesis' });
  const accrualId = await dag.addEvent([], { type: 'accrual', domain: 'z-domain', b: 10 });
  const composedId = await dag.addEvent([accrualId, genesisId], {
    type: 'reception', domain: 'test-domain', epoch: 3,
    receivedFrom: [{ sourceDomain: 'c', eventId: 'e1' }, { sourceDomain: 'a', eventId: 'e2' }],
    kind: 'full',
  });

  assert.equal(rustOutput.genesisId, genesisId, 'a real, minimal event id must match exactly across runtimes');
  assert.equal(rustOutput.accrualId, accrualId, 'a real event with a flat payload must match exactly across runtimes');
  assert.equal(rustOutput.composedId, composedId, 'a real event with a nested payload and out-of-order parents must match exactly — the real test of §3.1\'s own canonical sort, not just a pass-through case');

  // §15's own real, deterministic outcome — a real loss and a real
  // win, both independently recomputed here against the identical,
  // real JS generous-transfer.js.
  const losingHash = await computeOutcomeHash('commitment-id-abc', 'vdf-output-xyz-123');
  const winningHash = await computeOutcomeHash('commitment-id-abc', 'vdf-output-90');

  assert.equal(rustOutput.losingHash, losingHash, 'a real, honest-loss outcome hash must match exactly across runtimes');
  assert.equal(rustOutput.losingCheck4, checkOutcome(losingHash, 4), 'the real threshold check itself must agree across runtimes, not just the raw hash');
  assert.equal(rustOutput.winningHash, winningHash, 'a real, winning outcome hash must match exactly across runtimes');
  assert.equal(rustOutput.winningCheck8, checkOutcome(winningHash, 8));

  // §13's own real weighted median, two real, non-trivial vectors.
  const median1 = weightedMedian([{ value: 100, weight: 30 }, { value: 50, weight: 45 }, { value: 200, weight: 10 }, { value: 75, weight: 15 }]);
  const median2 = weightedMedian([{ value: 1000, weight: 5 }, { value: 2000, weight: 5 }, { value: 3000, weight: 90 }]);

  assert.equal(rustOutput.median1, median1, 'the real, custom crossing-point median (never an average of the two middle values) must match exactly across runtimes');
  assert.equal(rustOutput.median2, median2, 'a real, heavily-skewed-weight case must match exactly across runtimes too');

  // §9's own real split invariant — a real, large, 18-decimal AIWA amount.
  const total = 1000123456789012345678n;
  const firstAmount = 333333333333333333333n;
  const secondAmount = total - firstAmount;
  assert.equal(rustOutput.secondAmount, secondAmount.toString(), 'a real, large, 18-decimal AIWA split must match exactly across runtimes — u128 in Rust playing BigInt\'s own real role');

  // §4's own real reception monotonicity — the identical, real logic
  // mirror.js's own applyMirrorEvent uses internally, verified here
  // in isolation from the (already-standard, Ed25519) signature
  // machinery around it.
  function checkMonotonicity(priorMax, resolvedEpochs) {
    for (const [sourceDomain, newMax] of Object.entries(resolvedEpochs)) {
      const previous = priorMax[sourceDomain] ?? 0;
      if (newMax < previous) return false;
    }
    return true;
  }
  const priorMax1 = { mars: 50, jupiter: 10 };
  assert.equal(rustOutput.monotonicityCase1, checkMonotonicity(priorMax1, { mars: 55, jupiter: 10 }));
  assert.equal(rustOutput.monotonicityCase2, checkMonotonicity(priorMax1, { mars: 40, jupiter: 15 }), 'a real regression on even one real source domain must be rejected identically across runtimes');

  // §14's own real, central ratio computation — real IEEE 754 double
  // division, must agree bit-for-bit across runtimes.
  const observerDelta = 133 - 10;
  const targetDelta = 481 - 100;
  const ratio = targetDelta / observerDelta;
  assert.equal(rustOutput.ratio, ratio, 'a real, non-integer relative-rate ratio must match exactly across runtimes, down to the last real floating-point digit');

  // §13's own real consistency check — the one genuinely new, custom
  // piece of logic in the full Causal Tick flow.
  const consistentResult = checkCausalConsistency(100, { tick: 95 }, 10);
  const inconsistentResult = checkCausalConsistency(100, { tick: 50 }, 10);
  assert.equal(rustOutput.consistentCase, consistentResult.consistent);
  assert.equal(rustOutput.consistentGap, consistentResult.gap);
  assert.equal(rustOutput.inconsistentCase, inconsistentResult.consistent);
  assert.equal(rustOutput.inconsistentGap, inconsistentResult.gap);

  // §6.1's own real, PRACTICAL Wesolowski verification — the one
  // path a real, external, gas-constrained chain would actually use
  // (never the raw, symmetric hash chain, prohibitively expensive to
  // redo). Confirms this project's own "native interchain" claim
  // (§16.1) concretely, not by assertion: the real, complete
  // verification algorithm — including real prime-derivation and
  // Miller-Rabin primality testing — is genuinely, faithfully
  // reproducible outside JS.
  const x = 123456789n;
  const iterations = 50;
  const y = evaluate(x, iterations);
  const proof = { pi: 1n, l: 182976577130776636739865532488529097497n };
  const jsValid = await verifyWesolowski(x, iterations, y, proof);
  const jsInvalid = await verifyWesolowski(x, iterations, y + 1n, proof);
  assert.equal(jsValid, true, 'sanity: the real, known-good test vector must verify in JS itself first');
  assert.equal(rustOutput.wesolowskiValid, jsValid, 'a real, valid Wesolowski proof must verify identically across runtimes');
  assert.equal(rustOutput.wesolowskiInvalid, jsInvalid, 'a real, tampered y must be rejected identically across runtimes');

  // The final, real piece for §16.1's own "native interchain" claim
  // — a real signature, produced by the real JS library
  // (@noble/curves) this project actually uses, independently
  // verified by a genuinely different real library (ed25519-dalek),
  // never the same one — confirming the algorithm itself, not one
  // particular implementation, is what a real signature depends on.
  function toHex(bytes) { return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(''); }
  const edPubkeyHex = 'bd625af599e22fdfd30a9b76600abe5beb36571854d0532cda94f67724069485';
  const edMessage = new TextEncoder().encode('{"contractId":"aiwa-generous-transfer-v1","to":"bob"}');
  const edSignatureHex = '23b5759273caddaf0f4d7e40912061f1e0f2c163c19181a76d30187721e6f198bebbe1c4ee0558b477ea26fd516eafdc521876c5d61efe8d17502cb1035c8e06';
  const jsEdValid = ed25519.verify(hexToBytesLocal(edSignatureHex), edMessage, hexToBytesLocal(edPubkeyHex));
  assert.equal(jsEdValid, true, 'sanity: the real, known-good Ed25519 test vector must verify in JS itself first');
  assert.equal(rustOutput.ed25519Valid, true, 'a real signature, produced by the real JS library this project uses, must verify under a genuinely different, independent real Rust library');
  assert.equal(rustOutput.ed25519Invalid, false, 'a real, tampered message must be rejected identically — the real signature was never over this content');
});

function hexToBytesLocal(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
