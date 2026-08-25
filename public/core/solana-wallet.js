// Real Solana keypair management and burn-transaction construction.
// Key generation, encryption, signing are fully offline; broadcasting
// is the one real network boundary.

import { SOLANA_INCINERATOR_ADDRESS } from './identity-cost.js';

const PBKDF2_ITERATIONS = 200_000;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Verified against the standard 'Hello World!' -> '2NEpo7TZRRrLZSi2U' test
// vector before use — never trusted on first write.
function base58Encode(bytes) {
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  let result = '';
  while (num > 0n) {
    const rem = num % 58n;
    num /= 58n;
    result = BASE58_ALPHABET[Number(rem)] + result;
  }
  return '1'.repeat(zeros) + result;
}

// A real, minimal, Solana-Keypair-SHAPED object — sufficient for
// identity derivation and display — generated using only
// @noble/curves/ed25519.js, already proven to load reliably. Deliberately
// avoids requiring the full, genuinely heavy @solana/web3.js library
// (many transitive dependencies — buffer, crypto polyfills, websockets)
// just to create an identity, which is the FIRST, most critical
// interaction a new person has with this app. The full library is
// loaded lazily, later, only when actually broadcasting a real
// transaction (Ignition's own concern, not identity creation's).
function wrapAsKeypairShape(secretKey32, publicKey32) {
  const secretKey = new Uint8Array(64);
  secretKey.set(secretKey32, 0);
  secretKey.set(publicKey32, 32);
  const base58 = base58Encode(publicKey32);
  return {
    secretKey,
    publicKey: { toBytes: () => publicKey32, toBase58: () => base58, toString: () => base58 },
  };
}

export async function generateLightweightKeypair() {
  const { ed25519 } = await import('@noble/curves/ed25519.js');
  const secretKey32 = ed25519.utils.randomSecretKey();
  const publicKey32 = ed25519.getPublicKey(secretKey32);
  return wrapAsKeypairShape(secretKey32, publicKey32);
}

export async function lightweightKeypairFromSecretKey(secretKeyBytes) {
  const { ed25519 } = await import('@noble/curves/ed25519.js');
  if (secretKeyBytes.length !== 64) throw new Error(`Expected a 64-byte secret key, got ${secretKeyBytes.length}`);
  const secretKey32 = secretKeyBytes.slice(0, 32);
  const publicKey32 = ed25519.getPublicKey(secretKey32);
  // The embedded public key half must really match what this seed derives — catches a corrupted or non-matching import early.
  if (base58Encode(publicKey32) !== base58Encode(secretKeyBytes.slice(32, 64))) {
    throw new Error('Secret key is malformed: embedded public key does not match the derived one.');
  }
  return wrapAsKeypairShape(secretKey32, publicKey32);
}

// A real, deterministic identity from a passphrase alone — the same
// passphrase always derives the identical real keypair, anywhere,
// with nothing else to carry or transport. A fixed, application-
// specific salt is used deliberately: reproducibility from the
// passphrase ALONE is the entire point (a random salt would make that
// impossible), at the real, honest cost of losing the extra defense a
// random salt gives against a precomputed attack — the passphrase
// itself is the only real secret here, exactly like a private key
// written down in words instead of bytes. A weak, guessable
// passphrase is exactly as unsafe as a weak, guessable private key.
const PASSPHRASE_SALT = new TextEncoder().encode('aiwa-chain-passphrase-identity-v1');
const PASSPHRASE_ITERATIONS = 600_000;

export async function deriveKeypairFromPassphrase(passphrase) {
  const { ed25519 } = await import('@noble/curves/ed25519.js');
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: PASSPHRASE_SALT, iterations: PASSPHRASE_ITERATIONS, hash: 'SHA-256' }, keyMaterial, 256);
  const secretKey32 = new Uint8Array(bits);
  const publicKey32 = ed25519.getPublicKey(secretKey32);
  return wrapAsKeypairShape(secretKey32, publicKey32);
}

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
