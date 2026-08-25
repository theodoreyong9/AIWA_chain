// Real Solana keypair management and burn-transaction construction.
// Key generation, encryption, signing are fully offline; broadcasting
// is the one real network boundary.

import { SOLANA_INCINERATOR_ADDRESS } from './identity-cost.js';

const PBKDF2_ITERATIONS = 200_000;

export function generateKeypair(solanaWeb3) {
  return solanaWeb3.Keypair.generate();
}

export function keypairFromSecretKey(solanaWeb3, secretKeyBytes) {
  return solanaWeb3.Keypair.fromSecretKey(secretKeyBytes);
}

export async function encryptSecretKey(secretKeyBytes, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, secretKeyBytes);
  return { salt: Array.from(salt), iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
}

export async function decryptSecretKey(record, password) {
  const salt = new Uint8Array(record.salt);
  const iv = new Uint8Array(record.iv);
  const ciphertext = new Uint8Array(record.ciphertext);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new Uint8Array(plaintext);
  } catch {
    throw new Error('Wrong password');
  }
}

export function buildBurnTransaction(solanaWeb3, { fromPubkey, lamports, recentBlockhash }) {
  if (!Number.isInteger(lamports) || lamports <= 0) throw new RangeError(`lamports must be a positive integer, got ${lamports}`);
  const tx = new solanaWeb3.Transaction();
  tx.add(solanaWeb3.SystemProgram.transfer({ fromPubkey, toPubkey: new solanaWeb3.PublicKey(SOLANA_INCINERATOR_ADDRESS), lamports }));
  tx.recentBlockhash = recentBlockhash;
  tx.feePayer = fromPubkey;
  return tx;
}

export function signAndSerialize(tx, keypair) {
  tx.sign(keypair);
  return tx.serialize();
}

export async function broadcastBurnTransaction(solanaWeb3, connection, keypair, lamports) {
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  const tx = buildBurnTransaction(solanaWeb3, { fromPubkey: keypair.publicKey, lamports, recentBlockhash: blockhash });
  const raw = signAndSerialize(tx, keypair);
  const signature = await connection.sendRawTransaction(raw);
  await connection.confirmTransaction(signature, 'finalized');
  return signature;
}

export async function loadSolanaWeb3() {
  if (typeof window !== 'undefined' && window.solanaWeb3) return window.solanaWeb3;
  const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Loading @solana/web3.js timed out after ${ms / 1000}s`)), ms));
  const mod = await Promise.race([import('https://esm.sh/@solana/web3.js@1.98.0'), timeout(15000)]);
  if (typeof window !== 'undefined') window.solanaWeb3 = mod;
  return mod;
}
