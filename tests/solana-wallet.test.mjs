import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as solanaWeb3 from '@solana/web3.js';
import {
  generateKeypair, keypairFromSecretKey, encryptSecretKey, decryptSecretKey,
  buildBurnTransaction, signAndSerialize, generateLightweightKeypair, lightweightKeypairFromSecretKey,
  deriveKeypairFromPassphrase,
} from '../public/core/solana-wallet.js';
import { SOLANA_INCINERATOR_ADDRESS } from '../public/core/identity-cost.js';

test('generateKeypair produces a real, usable Ed25519 keypair', () => {
  const kp = generateKeypair(solanaWeb3);
  assert.ok(kp.publicKey instanceof solanaWeb3.PublicKey);
  assert.equal(kp.secretKey.length, 64);
});

test('keypairFromSecretKey reconstructs the identical keypair', () => {
  const original = generateKeypair(solanaWeb3);
  const rebuilt = keypairFromSecretKey(solanaWeb3, original.secretKey);
  assert.equal(rebuilt.publicKey.toBase58(), original.publicKey.toBase58());
});

test('encryptSecretKey / decryptSecretKey round-trips the real secret key bytes', async () => {
  const kp = generateKeypair(solanaWeb3);
  const record = await encryptSecretKey(kp.secretKey, 'a real password');
  const decrypted = await decryptSecretKey(record, 'a real password');
  assert.deepEqual(Array.from(decrypted), Array.from(kp.secretKey));
});

test('decryptSecretKey rejects the wrong password instead of returning garbage', async () => {
  const kp = generateKeypair(solanaWeb3);
  const record = await encryptSecretKey(kp.secretKey, 'right password');
  await assert.rejects(decryptSecretKey(record, 'wrong password'), /Wrong password/);
});

test('buildBurnTransaction targets the real incinerator address', () => {
  const kp = generateKeypair(solanaWeb3);
  const tx = buildBurnTransaction(solanaWeb3, { fromPubkey: kp.publicKey, lamports: 1000, recentBlockhash: solanaWeb3.Keypair.generate().publicKey.toBase58() });
  const instruction = tx.instructions[0];
  const toPubkey = new solanaWeb3.PublicKey(instruction.keys[1].pubkey);
  assert.equal(toPubkey.toBase58(), SOLANA_INCINERATOR_ADDRESS);
});

test('buildBurnTransaction rejects a non-positive lamport amount', () => {
  const kp = generateKeypair(solanaWeb3);
  assert.throws(() => buildBurnTransaction(solanaWeb3, { fromPubkey: kp.publicKey, lamports: 0, recentBlockhash: solanaWeb3.Keypair.generate().publicKey.toBase58() }), RangeError);
});

test('signAndSerialize produces real, validly-signed bytes', () => {
  const kp = generateKeypair(solanaWeb3);
  const tx = buildBurnTransaction(solanaWeb3, { fromPubkey: kp.publicKey, lamports: 1000, recentBlockhash: solanaWeb3.Keypair.generate().publicKey.toBase58() });
  const raw = signAndSerialize(tx, kp);
  const roundTripped = solanaWeb3.Transaction.from(raw);
  assert.equal(roundTripped.signatures[0].publicKey.toBase58(), kp.publicKey.toBase58());
});

test('generateLightweightKeypair produces a real, usable keypair shape, no @solana/web3.js involved', async () => {
  const kp = await generateLightweightKeypair();
  assert.equal(kp.secretKey.length, 64);
  assert.equal(kp.publicKey.toBytes().length, 32);
  assert.equal(typeof kp.publicKey.toBase58(), 'string');
});

test('THE REAL PROPERTY: a lightweight keypair and a real solanaWeb3 keypair from the identical seed derive the identical base58 address', async () => {
  const solanaKp = generateKeypair(solanaWeb3);
  const seed = solanaKp.secretKey.slice(0, 32);
  const rebuilt = await lightweightKeypairFromSecretKey(solanaKp.secretKey);
  assert.equal(rebuilt.publicKey.toBase58(), solanaKp.publicKey.toBase58(), 'the lightweight path must derive the exact same real identity as the full library would');
});

test('lightweightKeypairFromSecretKey round-trips a real secret key exactly', async () => {
  const original = await generateLightweightKeypair();
  const rebuilt = await lightweightKeypairFromSecretKey(original.secretKey);
  assert.deepEqual(Array.from(rebuilt.secretKey), Array.from(original.secretKey));
  assert.equal(rebuilt.publicKey.toBase58(), original.publicKey.toBase58());
});

test('SECURITY: lightweightKeypairFromSecretKey rejects a secret key whose embedded public half does not match', async () => {
  const a = await generateLightweightKeypair();
  const b = await generateLightweightKeypair();
  const tampered = new Uint8Array(64);
  tampered.set(a.secretKey.slice(0, 32), 0);
  tampered.set(b.publicKey.toBytes(), 32); // a real seed, but someone else's real public half
  await assert.rejects(lightweightKeypairFromSecretKey(tampered), /does not match/);
});

test('lightweightKeypairFromSecretKey rejects the wrong length', async () => {
  await assert.rejects(lightweightKeypairFromSecretKey(new Uint8Array(32)), /64-byte/);
});

test('THE REAL PROPERTY: the same passphrase derives the identical real identity, every time', async () => {
  const a = await deriveKeypairFromPassphrase('correct horse battery staple');
  const b = await deriveKeypairFromPassphrase('correct horse battery staple');
  assert.equal(a.publicKey.toBase58(), b.publicKey.toBase58());
  assert.deepEqual(Array.from(a.secretKey), Array.from(b.secretKey));
});

test('a different passphrase derives a different, real identity', async () => {
  const a = await deriveKeypairFromPassphrase('passphrase one');
  const b = await deriveKeypairFromPassphrase('passphrase two');
  assert.notEqual(a.publicKey.toBase58(), b.publicKey.toBase58());
});

test('deriveKeypairFromPassphrase produces a real, usable keypair shape', async () => {
  const kp = await deriveKeypairFromPassphrase('a real test passphrase');
  assert.equal(kp.secretKey.length, 64);
  assert.equal(kp.publicKey.toBytes().length, 32);
  assert.equal(typeof kp.publicKey.toBase58(), 'string');
});
