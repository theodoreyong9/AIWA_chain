import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modPow, isProbablePrime, hashToPrime } from '../public/core/bigint-math.js';

test('modPow matches hand-computable small cases', () => {
  assert.equal(modPow(2n, 10n, 1000n), 24n); // 2^10 = 1024, mod 1000 = 24
  assert.equal(modPow(3n, 4n, 5n), 1n); // 3^4 = 81, mod 5 = 1
  assert.equal(modPow(5n, 0n, 7n), 1n); // any base ^ 0 = 1
  assert.equal(modPow(7n, 1n, 5n), 2n); // 7 mod 5 = 2
});

test('modPow matches a real, independently-verifiable large case', () => {
  // 2^64 mod (2^31 - 1), computed independently via Python: pow(2,64,2**31-1) = 4
  assert.equal(modPow(2n, 64n, (1n << 31n) - 1n), 4n);
});

test('isProbablePrime correctly identifies small known primes', () => {
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 97n, 997n, 7919n]) {
    assert.equal(isProbablePrime(p), true, `${p} should be prime`);
  }
});

test('isProbablePrime correctly rejects small known composites', () => {
  for (const c of [1n, 4n, 6n, 8n, 9n, 15n, 100n, 1000n, 7920n]) {
    assert.equal(isProbablePrime(c), false, `${c} should be composite`);
  }
});

test('isProbablePrime correctly identifies a real, large known prime (a Mersenne prime exponent case)', () => {
  // 2^127 - 1 is a real, well-known Mersenne prime (verified independently)
  assert.equal(isProbablePrime((1n << 127n) - 1n), true);
});

test('isProbablePrime correctly rejects a known Carmichael number — the exact case naive Fermat tests get wrong', () => {
  // 561 = 3 x 11 x 17, the smallest Carmichael number — passes Fermat's
  // test for every base coprime to it, but Miller-Rabin correctly
  // rejects it. A real, meaningful test, not a coincidence.
  assert.equal(isProbablePrime(561n), false);
});

test('hashToPrime is deterministic for the same input', async () => {
  const msg = new TextEncoder().encode('same input');
  const p1 = await hashToPrime(msg);
  const p2 = await hashToPrime(msg);
  assert.equal(p1, p2);
});

test('hashToPrime output is a real, verified prime', async () => {
  const p = await hashToPrime(new TextEncoder().encode('any input'));
  assert.equal(isProbablePrime(p), true);
});

test('hashToPrime output has the requested bit length', async () => {
  const p = await hashToPrime(new TextEncoder().encode('bitlength check'), 128);
  assert.ok(p >= (1n << 127n));
  assert.ok(p < (1n << 128n));
});

test('hashToPrime differs for different inputs', async () => {
  const p1 = await hashToPrime(new TextEncoder().encode('input A'));
  const p2 = await hashToPrime(new TextEncoder().encode('input B'));
  assert.notEqual(p1, p2);
});
