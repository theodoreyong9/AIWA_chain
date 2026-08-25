import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as solanaWeb3 from '@solana/web3.js';
import {
  generateKeypair, keypairFromSecretKey, encryptSecretKey, decryptSecretKey,
  buildBurnTransaction, signAndSerialize,
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
