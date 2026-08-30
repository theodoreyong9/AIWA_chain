import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { computeContractHash } from '../public/core/contract-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('SECURITY, THE REAL PINNED-HASH FRESHNESS PROPERTY: app.js\'s own real, pinned contract hashes genuinely match the real, current source of every contract it registers — never silently stale', async () => {
  const appSource = readFileSync(path.join(__dirname, '../public/app/app.js'), 'utf-8');

  // A real, direct read of the real PINNED_CONTRACT_HASHES object
  // app.js's own source actually contains — never a copy kept only
  // here, which could itself drift independently.
  const match = appSource.match(/const PINNED_CONTRACT_HASHES = (\{[\s\S]*?\});/);
  assert.ok(match, 'app.js must still define a real PINNED_CONTRACT_HASHES object for this real test to check');
  const pinned = Function(`"use strict"; return ${match[1]};`)();

  const realFiles = {
    'aiwa-generous-transfer-v1': '../public/core/generous-transfer.js',
    'aiwa-matching-v1': '../public/core/matching-contract.js',
  };

  assert.deepEqual(Object.keys(pinned).sort(), Object.keys(realFiles).sort(), 'every real, pinned contractId must have a known, real source file to check against, and vice versa');

  for (const [contractId, relativePath] of Object.entries(realFiles)) {
    const realSource = readFileSync(path.join(__dirname, relativePath), 'utf-8');
    const realHash = await computeContractHash(realSource);
    assert.equal(
      pinned[contractId], realHash,
      `app.js's own pinned hash for '${contractId}' no longer matches its real, current source — the real, live application would now refuse to register it. Update the real, pinned constant in app.js to match.`
    );
  }
});
