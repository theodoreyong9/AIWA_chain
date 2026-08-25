import { deriveDomainId } from '../core/domain-id.js';
import { generateKeypair, keypairFromSecretKey, encryptSecretKey, decryptSecretKey, loadSolanaWeb3 } from '../core/solana-wallet.js';
import { state, notify } from './state.js';
import { startProgressionLoop, rematerialize } from './app.js';

const SAVED_KEY_STORAGE = 'aiwa-chain-saved-key';

async function finishActivation(kp) {
  state.keypair = kp;
  state.domainId = await deriveDomainId(kp.publicKey.toBytes());
  await rematerialize();
  startProgressionLoop();
}

export async function activateWithNewKeypair() {
  const solanaWeb3 = await loadSolanaWeb3();
  await finishActivation(generateKeypair(solanaWeb3));
}

export async function activateWithSecretKeyBytes(bytes) {
  const solanaWeb3 = await loadSolanaWeb3();
  await finishActivation(keypairFromSecretKey(solanaWeb3, bytes));
}

export function hasSavedKey() {
  return localStorage.getItem(SAVED_KEY_STORAGE) !== null;
}

export async function saveCurrentKey(password) {
  if (!state.keypair) throw new Error('No active identity to save.');
  const record = await encryptSecretKey(state.keypair.secretKey, password);
  localStorage.setItem(SAVED_KEY_STORAGE, JSON.stringify(record));
}

export async function unlockSavedKey(password) {
  const raw = localStorage.getItem(SAVED_KEY_STORAGE);
  if (!raw) throw new Error('No saved key found.');
  const secretKeyBytes = await decryptSecretKey(JSON.parse(raw), password);
  await activateWithSecretKeyBytes(secretKeyBytes);
}

export function clearSavedKey() {
  localStorage.removeItem(SAVED_KEY_STORAGE);
}
