import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVdfChain, vdfSeed } from '../public/core/vdf.js';
import { deriveDomainId } from '../public/core/domain-id.js';
import { EventDag } from '../public/core/event-dag.js';
import { computeOutcomeHash, checkOutcome } from '../public/core/generous-transfer.js';

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
});
