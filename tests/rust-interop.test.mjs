import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVdfChain, vdfSeed } from '../public/core/vdf.js';
import { deriveDomainId } from '../public/core/domain-id.js';

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
});
