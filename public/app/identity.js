import { deriveDomainId } from '../core/domain-id.js';
import { generateLightweightKeypair, lightweightKeypairFromSecretKey, deriveKeypairFromPassphrase, encryptSecretKey, decryptSecretKey } from '../core/solana-wallet.js';
import { state, notify } from './state.js';
import { startProgressionLoop, refreshCausalTick } from './app.js';

const SAVED_KEY_STORAGE = 'aiwa-chain-saved-key';

async function finishActivation(kp) {
  state.keypair = kp;
  state.domainId = await deriveDomainId(kp.publicKey.toBytes());
  // wallet/mirror/identity-cost are already real and current from
  // boot's own full materialization, covering every domain regardless
  // of which one happens to be active — only the causal tick actually
  // depends on which identity this now is. Redoing the rest here
  // would be real, wasted, expensive re-verification for no reason.
  await refreshCausalTick();
  notify();
  startProgressionLoop();
}

export async function activateWithNewKeypair() {
  await finishActivation(await generateLightweightKeypair());
}

export async function activateWithSecretKeyBytes(bytes) {
  await finishActivation(await lightweightKeypairFromSecretKey(bytes));
}

// The same real identity, anywhere, from a passphrase alone — see
// solana-wallet.js's own header on deriveKeypairFromPassphrase for
// the real, honest trade-off this makes.
export async function activateWithPassphrase(passphrase) {
  await finishActivation(await deriveKeypairFromPassphrase(passphrase));
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
// encrypted key (clearSavedKey is a distinct, deliberate action).
// wallet/mirror/identity-cost are NOT reset — they are real, global
// materializations covering every domain, not specific to whichever
// identity happens to be active; only causalTick genuinely depends on
// that, and is cleared here.
export function disconnect() {
  state.keypair = null;
  state.domainId = null;
  state.causalTick = null;
  state.activeTab = 'continuum'; // Ignition/Mirror's own no-identity screens have no way back — always land somewhere with real navigation
}
