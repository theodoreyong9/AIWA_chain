import { state, short } from './state.js';
import { render, applyIncremental } from './app.js';
import { networkConfigDevnet } from './network.js';
import { loadSolanaWeb3, broadcastBurnTransaction, broadcastTransferTransaction } from '../core/solana-wallet.js';
import { hasIdentityCost } from '../core/identity-cost.js';
import { deriveIdentityCostState } from './identity-cost-view.js';
import { disconnect } from './identity.js';

let connection = null;
let solBalanceLamports = null;
let busy = false;
let lastMsg = null;
let sendBusy = false;
let lastSendMsg = null;

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
let autoRefreshInterval = null;

function startAutoRefresh() {
  if (autoRefreshInterval) return;
  autoRefreshInterval = setInterval(() => {
    if (state.activeTab !== 'ignition' || !state.domainId) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
      return;
    }
    refreshBalance();
  }, 20000);
}

export function renderIgnition(root) {
  if (!state.domainId) {
    root.innerHTML = `
      <div class="top-bar"><div style="display:flex; align-items:center; gap:10px"><div class="wordmark">AIWA <em>chain</em></div><a href="https://github.com/theodoreyong9/AIWA_chain" target="_blank" rel="noopener" class="gh-link" title="View source on GitHub">GitHub</a><a href="YELLOWPAPER.pdf" target="_blank" class="gh-link" title="Read the Yellow Paper (PDF)">Yellow Paper</a></div></div>
      <div class="tabs">
        <div class="tab" data-tab="continuum">Continuum</div>
        <div class="tab" data-tab="mirror">Mirror</div>
        <div class="tab active" data-tab="ignition">Ignition</div>
      <div class="tab" data-tab="generous">Give</div>
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
  startAutoRefresh();

  const balance = solBalanceLamports !== null ? (solBalanceLamports / 1e9).toFixed(6) : '\u2014';
  const identityCostState = state.identityCost;
  const already = hasIdentityCost(identityCostState, state.domainId);

  root.innerHTML = `
    <div class="top-bar">
      <div style="display:flex; align-items:center; gap:10px"><div class="wordmark">AIWA <em>chain</em></div><a href="https://github.com/theodoreyong9/AIWA_chain" target="_blank" rel="noopener" class="gh-link" title="View source on GitHub">GitHub</a><a href="YELLOWPAPER.pdf" target="_blank" class="gh-link" title="Read the Yellow Paper (PDF)">Yellow Paper</a></div>
      <div style="display:flex; align-items:center; gap:8px">
        <div class="address-chip" id="addr-copy" title="Click to copy">${short(state.keypair.publicKey.toBase58(), 10)}</div>
        <button class="ghost" id="disconnect-btn" style="padding:5px 10px; font-size:11px">Disconnect</button>
      </div>
    </div>
    <div class="tabs">
      <div class="tab" data-tab="continuum">Continuum</div>
      <div class="tab" data-tab="mirror">Mirror</div>
      <div class="tab active" data-tab="ignition">Ignition</div>
      <div class="tab" data-tab="generous">Give</div>
    </div>

    <div class="hero">
      <div class="hero-balance">${balance}</div>
      <div class="hero-unit">SOL \u00b7 devnet</div>
      <div class="status-line"><span class="status-dot ${already ? 'continuous' : 'partitioned'}"></span>${already ? 'ignited' : 'not yet ignited'}</div>
      <p class="hint" style="margin-top:14px; max-width:340px; margin-left:auto; margin-right:auto">This wallet only works with a real path back to Earth's own Solana network \u2014 activating, checking a balance, sending SOL, all need it. Continuum, once ignited, needs none of that ever again.</p>
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
      <div class="card-title">Send SOL</div>
      <p class="hint">A real, ordinary transfer \u2014 unlike Ignite, this SOL is recoverable by whoever you send it to, not burned.</p>
      <label class="field-label">To</label>
      <input type="text" id="send-sol-to" placeholder="recipient's Solana address" />
      <label class="field-label">Amount (SOL)</label>
      <input type="text" id="send-sol-amount" placeholder="0.01" />
      <div class="btn-row"><button class="primary" id="send-sol-btn" ${sendBusy ? 'disabled' : ''}>Send</button></div>
      <div id="send-sol-msg">${lastSendMsg ?? ''}</div>
    </div>

    <div class="card">
      <div class="card-title">Devnet faucet</div>
      <p class="hint">Free devnet SOL for testing \u2014 opens Solana's own real faucet in a new tab, with your address copied to your clipboard first.</p>
      <div class="btn-row"><button id="faucet-btn">Get devnet SOL</button></div>
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
  root.querySelector('#faucet-btn').addEventListener('click', () => {
    navigator.clipboard?.writeText(state.keypair.publicKey.toBase58());
    window.open(networkConfigDevnet.faucet, '_blank', 'noopener');
  });
  root.querySelector('#refresh-btn').addEventListener('click', refreshBalance);
  root.querySelector('#burn-btn').addEventListener('click', () => doBurn(root));
  root.querySelector('#send-sol-btn').addEventListener('click', () => doSendSol(root));
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
    const realKeypair = solanaWeb3.Keypair.fromSecretKey(state.keypair.secretKey);
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms));
    const signature = await Promise.race([broadcastBurnTransaction(solanaWeb3, conn, realKeypair, lamports), timeout(30000)]);

    const identityCostPayload = { type: 'identity-cost', domain: state.domainId, signature, burnedLamports: lamports, slot: null };
    const identityCostParents = [state.lastEventId];
    const identityCostId = await state.dag.addEvent(identityCostParents, identityCostPayload);
    state.lastEventId = identityCostId;
    await applyIncremental(identityCostId, identityCostParents, identityCostPayload);

    const accrualPayload = { type: 'accrual', domain: state.domainId, b: solAmount };
    const accrualParents = [state.lastEventId];
    const accrualId = await state.dag.addEvent(accrualParents, accrualPayload);
    state.lastEventId = accrualId;
    await applyIncremental(accrualId, accrualParents, accrualPayload);
    // identity-cost events carry no VDF proof to verify — cheap to
    // recompute in full, unlike wallet's own progression history.
    state.identityCost = deriveIdentityCostState(state.dag);
    setMsg(`<div class="msg ok">Ignited \u2014 signature ${short(signature, 8)}. Real accrual is now running in Continuum.</div>`);
  } catch (e) {
    setMsg(`<div class="msg error">Burn failed: ${e.message}. Check the devnet faucet if your balance is too low.</div>`);
  }
  busy = false;
  refreshBalance();
}

async function doSendSol(root) {
  if (sendBusy) return;
  sendBusy = true;
  const msgEl = root.querySelector('#send-sol-msg');
  const toAddress = root.querySelector('#send-sol-to').value.trim();
  const solAmount = parseFloat(root.querySelector('#send-sol-amount').value);
  const setMsg = (html) => { msgEl.innerHTML = html; lastSendMsg = html; };

  if (!toAddress) { setMsg(`<div class="msg error">Enter a recipient address.</div>`); sendBusy = false; return; }
  if (!Number.isFinite(solAmount) || solAmount <= 0) { setMsg(`<div class="msg error">Enter a positive SOL amount.</div>`); sendBusy = false; return; }
  const lamports = Math.round(solAmount * 1e9);

  setMsg(`<div class="msg">Broadcasting to devnet\u2026 (times out after 30s)</div>`);
  try {
    const solanaWeb3 = await loadSolanaWeb3();
    const conn = await getConnection();
    const realKeypair = solanaWeb3.Keypair.fromSecretKey(state.keypair.secretKey);
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms));
    const signature = await Promise.race([broadcastTransferTransaction(solanaWeb3, conn, realKeypair, toAddress, lamports), timeout(30000)]);
    setMsg(`<div class="msg ok">Sent \u2014 signature ${short(signature, 8)}.</div>`);
  } catch (e) {
    setMsg(`<div class="msg error">Send failed: ${e.message}</div>`);
  }
  sendBusy = false;
  refreshBalance();
}
