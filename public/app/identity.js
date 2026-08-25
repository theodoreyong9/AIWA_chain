import { deriveDomainId } from '../core/domain-id.js';
import { generateLightweightKeypair, lightweightKeypairFromSecretKey, encryptSecretKey, decryptSecretKey } from '../core/solana-wallet.js';
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
  await finishActivation(await generateLightweightKeypair());
}

export async function activateWithSecretKeyBytes(bytes) {
  await finishActivation(await lightweightKeypairFromSecretKey(bytes));
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

// Stops acting as the current identity — the progression loop's own
// `while (state.keypair)` naturally exits once this clears, after
// finishing whatever epoch is already mid-computation. Never touches
// the real, persisted DAG history (IndexedDB) or a separately-saved
// encrypted key (clearSavedKey is a distinct, deliberate action) —
// only the in-memory "who am I acting as right now" state.
export function disconnect() {
  state.keypair = null;
  state.domainId = null;
  state.wallet = null;
  state.mirror = null;
  state.identityCost = null;
  state.causalTick = null;
  state.activeTab = 'continuum'; // Ignition/Mirror's own no-identity screens have no way back — always land somewhere with real navigation
}
