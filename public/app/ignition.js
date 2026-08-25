import { state, short } from './state.js';
import { render, rematerialize } from './app.js';
import { networkConfigDevnet } from './network.js';
import { loadSolanaWeb3, broadcastBurnTransaction } from '../core/solana-wallet.js';
import { hasIdentityCost } from '../core/identity-cost.js';
import { disconnect } from './identity.js';

let connection = null;
let solBalanceLamports = null;
let busy = false;
let lastMsg = null;

async function getConnection() {
  if (connection) return connection;
  const solanaWeb3 = await loadSolanaWeb3();
  connection = new solanaWeb3.Connection(networkConfigDevnet.rpcEndpoint, 'confirmed');
  return connection;
}

async function refreshBalance() {
  if (!state.keypair) return;
  const solanaWeb3 = await loadSolanaWeb3();
  const conn = await getConnection();
  const realPubkey = new solanaWeb3.PublicKey(state.keypair.publicKey.toBytes());
  solBalanceLamports = await conn.getBalance(realPubkey);
  render();
}

let lastRefreshedFor = null;

export function renderIgnition(root) {
  if (!state.domainId) {
    root.innerHTML = `
      <div class="top-bar"><div class="wordmark">AIWA <em>chain</em></div></div>
      <div class="tabs">
        <div class="tab" data-tab="continuum">Continuum</div>
        <div class="tab" data-tab="mirror">Mirror</div>
        <div class="tab active" data-tab="ignition">Ignition</div>
      </div>
      <div class="empty-state"><div class="glyph">\u25CB</div>No identity yet \u2014 create one in Continuum first.</div>
    `;
    root.querySelectorAll('.tab').forEach((el) => el.addEventListener('click', () => { state.activeTab = el.dataset.tab; render(); }));
    return;
  }

  if (lastRefreshedFor !== state.domainId) {
    lastRefreshedFor = state.domainId;
    refreshBalance();
  }

  const balance = solBalanceLamports !== null ? (solBalanceLamports / 1e9).toFixed(6) : '\u2014';
  const already = hasIdentityCost(state.identityCost, state.domainId);

  root.innerHTML = `
    <div class="top-bar">
      <div class="wordmark">AIWA <em>chain</em></div>
      <div style="display:flex; align-items:center; gap:8px">
        <div class="address-chip" id="addr-copy" title="Click to copy">${short(state.keypair.publicKey.toBase58(), 10)}</div>
        <button class="ghost" id="disconnect-btn" style="padding:5px 10px; font-size:11px">Disconnect</button>
      </div>
    </div>
    <div class="tabs">
      <div class="tab" data-tab="continuum">Continuum</div>
      <div class="tab" data-tab="mirror">Mirror</div>
      <div class="tab active" data-tab="ignition">Ignition</div>
    </div>

    <div class="hero">
      <div class="hero-balance">${balance}</div>
      <div class="hero-unit">SOL \u00b7 devnet</div>
      <div class="status-line"><span class="status-dot ${already ? 'continuous' : 'partitioned'}"></span>${already ? 'ignited' : 'not yet ignited'}</div>
    </div>

    <div class="card">
      <div class="card-title">Ignite</div>
      <p class="hint">One real, irreversible burn \u2014 the same key that holds SOL is the key AIWA accrues to. No separate AIWA key to create.</p>
      <label class="field-label">Amount (SOL)</label>
      <input type="text" id="burn-amount" placeholder="0.002" value="0.002" />
      <div class="btn-row"><button class="primary" id="burn-btn" ${busy ? 'disabled' : ''}>Burn & ignite</button></div>
      <div id="burn-msg">${lastMsg ?? ''}</div>
    </div>

    <div class="card">
      <div class="card-title">Refresh</div>
      <div class="btn-row"><button id="refresh-btn">Refresh SOL balance</button></div>
    </div>
  `;

  root.querySelectorAll('.tab').forEach((el) => el.addEventListener('click', () => { state.activeTab = el.dataset.tab; render(); }));
  root.querySelector('#addr-copy').addEventListener('click', () => navigator.clipboard?.writeText(state.keypair.publicKey.toBase58()));
  root.querySelector('#disconnect-btn').addEventListener('click', () => {
    if (!confirm('Disconnect from this identity? Your real history stays saved on this device (IndexedDB) and can be restored with your secret key \u2014 this only stops acting as it right now.')) return;
    disconnect();
    render();
  });
  root.querySelector('#refresh-btn').addEventListener('click', refreshBalance);
  root.querySelector('#burn-btn').addEventListener('click', () => doBurn(root));
}

async function doBurn(root) {
  if (busy) return;
  busy = true;
  const msgEl = root.querySelector('#burn-msg');
  const solAmount = parseFloat(root.querySelector('#burn-amount').value);
  const setMsg = (html) => { msgEl.innerHTML = html; lastMsg = html; };

  if (!Number.isFinite(solAmount) || solAmount <= 0) { setMsg(`<div class="msg error">Enter a positive SOL amount.</div>`); busy = false; return; }
  const lamports = Math.round(solAmount * 1e9);

  setMsg(`<div class="msg">Broadcasting to devnet\u2026 (times out after 30s)</div>`);
  try {
    const solanaWeb3 = await loadSolanaWeb3();
    const conn = await getConnection();
    // state.keypair is the lightweight, @noble/curves-based shape used
    // everywhere else in this app — reconstructed here into a real
    // solanaWeb3.Keypair only now, right where a real transaction
    // actually needs one. Its own secretKey is real and correct (a
    // genuine 32-byte seed + 32-byte public key), so this recovers the
    // identical identity, never a different one.
    const realKeypair = solanaWeb3.Keypair.fromSecretKey(state.keypair.secretKey);
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms));
    const signature = await Promise.race([broadcastBurnTransaction(solanaWeb3, conn, realKeypair, lamports), timeout(30000)]);

    state.lastEventId = await state.dag.addEvent([state.lastEventId], { type: 'identity-cost', domain: state.domainId, signature, burnedLamports: lamports, slot: null });
    state.lastEventId = await state.dag.addEvent([state.lastEventId], { type: 'accrual', domain: state.domainId, b: solAmount });
    await rematerialize();
    setMsg(`<div class="msg ok">Ignited \u2014 signature ${short(signature, 8)}. Real accrual is now running in Continuum.</div>`);
  } catch (e) {
    setMsg(`<div class="msg error">Burn failed: ${e.message}. Check the devnet faucet if your balance is too low.</div>`);
  }
  busy = false;
  refreshBalance();
}
