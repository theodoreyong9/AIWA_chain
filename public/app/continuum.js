import { state, short, REWARD_PARAMS } from './state.js';
import { render, applyIncremental } from './app.js';
import { activateWithNewKeypair, activateWithSecretKeyBytes, activateWithPassphrase, activateWithBip39Mnemonic, hasSavedKey, saveCurrentKey, unlockSavedKey, clearSavedKey, disconnect } from './identity.js';
import { claimableNow } from '../core/accrual.js';
import { spendableClaims, totalBalance, buildSignedTransferEvent, buildSignedSplitEvent } from '../core/wallet.js';
import { format as formatAiwaAmount, toUnits, fromUnits } from '../core/units.js';

// A real, fixed-decimal display for the main balance — formatAiwaAmount's
// own trailing-zero trimming is right for compact rows elsewhere, but
// looks visually inconsistent next to Ignition's own always-six-decimal
// SOL display when a balance happens to be a round number.
function formatHeroBalance(units) {
  const full = fromUnits(units);
  const [whole, frac = ''] = full.split('.');
  return `${whole}.${frac.padEnd(6, '0').slice(0, 6)}`;
}
import { checkCausalConsistency } from '../core/causal-tick.js';
import { computeResidualDiversity } from '../core/mirror.js';

let lastMsg = null;

function noIdentity(root) {
  root.innerHTML = `
    <div class="top-bar"><div style="display:flex; align-items:center; gap:10px"><div class="wordmark">AIWA <em>chain</em></div><a href="https://github.com/theodoreyong9/AIWA_chain" target="_blank" rel="noopener" class="gh-link" title="View source on GitHub">GitHub</a><a href="YELLOWPAPER.pdf" target="_blank" class="gh-link" title="Read the Yellow Paper (PDF)">Yellow Paper</a></div></div>
    <div class="card">
      <div class="empty-state">
        <div class="glyph">\u25CB</div>
        No identity yet. Value accrues to a real Ed25519 keypair \u2014 the same one used to ignite on Solana.
        <div class="btn-row" style="justify-content:center"><button class="primary" id="gen">Create identity</button></div>
        <div id="gen-msg"></div>
      </div>
    </div>
    ${hasSavedKey() ? `
    <div class="card">
      <div class="card-title">Unlock saved identity</div>
      <input type="password" id="unlock-pw" placeholder="password" />
      <div class="btn-row"><button class="primary" id="unlock">Unlock</button><button class="ghost" id="forget">Forget</button></div>
      <div id="unlock-msg"></div>
    </div>` : ''}
    <div class="card">
      <div class="card-title">Open with a passphrase</div>
      <p class="hint">The same real identity, anywhere \u2014 the identical passphrase always derives the identical keypair, on any device, with nothing else to carry. <strong style="color:var(--amber)">Requires at least 6 real, unrelated words.</strong> This app's own salt is fixed and public (visible in the source), so a short or guessable passphrase can be brute-forced by anyone \u2014 there is no random salt protecting you here, unlike a normal password. <strong style="color:var(--amber)">This is not BIP39</strong> \u2014 it uses a real derivation specific to this app, not the standard real Solana wallets use. If you have an existing Solana wallet's real seed phrase, use "Import a real Solana wallet" below instead \u2014 typing it here opens a real, but different and unrelated, identity.</p>
      <div style="display:flex; gap:6px">
        <input type="password" id="passphrase-input" placeholder="at least 6 real, unrelated words" style="flex:1" />
        <button type="button" class="ghost" id="passphrase-toggle" style="padding:0 12px">Show</button>
      </div>
      <div class="btn-row"><button class="primary" id="passphrase-btn">Open</button></div>
      <div id="passphrase-msg"></div>
    </div>
    <div class="card">
      <div class="card-title">Import a real Solana wallet</div>
      <p class="hint">A real, standard BIP39 seed phrase \u2014 the identical derivation Phantom, Solflare, and the Solana CLI use, at the identical standard path. Your existing wallet's real address opens here too, with the same real funds and history it already has.</p>
      <div style="display:flex; gap:6px">
        <input type="password" id="bip39-input" placeholder="your real 12 or 24-word seed phrase" style="flex:1" />
        <button type="button" class="ghost" id="bip39-toggle" style="padding:0 12px">Show</button>
      </div>
      <div class="btn-row"><button class="primary" id="bip39-btn">Import</button></div>
      <div id="bip39-msg"></div>
    </div>
    <div class="card">
      <div class="card-title">Or restore an existing key</div>
      <input type="password" id="import-key" placeholder="comma-separated secret key bytes" />
      <div class="btn-row"><button id="import">Restore</button></div>
      <div id="import-msg"></div>
    </div>
  `;
  root.querySelector('#gen').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msgEl = root.querySelector('#gen-msg');
    btn.disabled = true;
    btn.textContent = 'Creating\u2026';
    try {
      await activateWithNewKeypair();
      render();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Create identity';
      msgEl.innerHTML = `<div class="msg error">${err?.message ?? String(err)}</div>`;
    }
  });
  const unlockBtn = root.querySelector('#unlock');
  if (unlockBtn) unlockBtn.addEventListener('click', async () => {
    const msgEl = root.querySelector('#unlock-msg');
    try { await unlockSavedKey(root.querySelector('#unlock-pw').value); render(); }
    catch (e) { msgEl.innerHTML = `<div class="msg error">${e.message}</div>`; }
  });
  root.querySelector('#passphrase-toggle').addEventListener('click', (e) => {
    const input = root.querySelector('#passphrase-input');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.currentTarget.textContent = showing ? 'Show' : 'Hide';
  });
  root.querySelector('#passphrase-btn').addEventListener('click', async () => {
    const msgEl = root.querySelector('#passphrase-msg');
    const passphrase = root.querySelector('#passphrase-input').value;
    if (!passphrase) { msgEl.innerHTML = `<div class="msg error">Enter a passphrase.</div>`; return; }
    const wordCount = passphrase.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 6) {
      msgEl.innerHTML = `<div class="msg error">Too weak \u2014 use at least 6 real, unrelated words. The salt this app uses is fixed and public, so a short or common passphrase can be brute-forced by anyone.</div>`;
      return;
    }
    try { await activateWithPassphrase(passphrase); render(); }
    catch (e) { msgEl.innerHTML = `<div class="msg error">${e.message}</div>`; }
  });
  root.querySelector('#bip39-toggle').addEventListener('click', (e) => {
    const input = root.querySelector('#bip39-input');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.currentTarget.textContent = showing ? 'Show' : 'Hide';
  });
  root.querySelector('#bip39-btn').addEventListener('click', async () => {
    const msgEl = root.querySelector('#bip39-msg');
    const mnemonic = root.querySelector('#bip39-input').value;
    if (!mnemonic) { msgEl.innerHTML = `<div class="msg error">Enter your real seed phrase.</div>`; return; }
    try { await activateWithBip39Mnemonic(mnemonic); render(); }
    catch (e) { msgEl.innerHTML = `<div class="msg error">${e.message}</div>`; }
  });
  const forgetBtn = root.querySelector('#forget');
  if (forgetBtn) forgetBtn.addEventListener('click', () => { clearSavedKey(); render(); });
  root.querySelector('#import').addEventListener('click', async () => {
    const msgEl = root.querySelector('#import-msg');
    const raw = root.querySelector('#import-key').value.trim();
    try {
      const bytes = Uint8Array.from(raw.split(',').map((s) => parseInt(s.trim(), 10)));
      await activateWithSecretKeyBytes(bytes);
      render();
    } catch (e) { msgEl.innerHTML = `<div class="msg error">Could not restore: ${e.message}</div>`; }
  });
}

function activityLog() {
  const events = state.dag.topoOrder().filter((e) => e.payload?.domain === state.domainId || e.payload?.type === 'genesis');
  const relevant = events.filter((e) => ['genesis', 'identity-cost', 'accrual', 'claim', 'transfer', 'split'].includes(e.payload?.type)).slice(-10).reverse();
  if (relevant.length === 0) return `<div class="timeline-empty">Nothing yet \u2014 your activity starts with your first action.</div>`;

  const describe = (p) => {
    if (p.type === 'genesis') return { label: 'Genesis', detail: 'Local history started' };
    if (p.type === 'identity-cost') return { label: 'Ignited', detail: `${short(p.signature, 8)}` };
    if (p.type === 'accrual') return { label: 'Committed', detail: `${p.b} SOL` };
    if (p.type === 'claim') return { label: 'Claimed', detail: `${p.amount} AIWA` };
    if (p.type === 'transfer') return p.from === state.domainId
      ? { label: 'Sent', detail: `\u2192 ${short(p.to, 10)}` }
      : { label: 'Received', detail: `\u2190 ${short(p.from, 10)}` };
    if (p.type === 'split') return { label: 'Split', detail: 'a claim into two' };
    return { label: p.type, detail: '' };
  };

  return relevant.map((e) => {
    const { label, detail } = describe(e.payload);
    return `<div class="list-row"><div style="flex:1"><div class="row-value" style="font-size:12.5px">${label}</div><div class="hint" style="margin:2px 0 0">${detail}</div></div></div>`;
  }).join('');
}

function activeContinuum(root) {
  const claimable = claimableNow(REWARD_PARAMS, state.wallet.accrual, state.domainId);
  const claims = spendableClaims(state.wallet, state.domainId);
  const spendable = claims.reduce((s, c) => s + c.amount, 0n);
  const total = totalBalance(REWARD_PARAMS, state.wallet, state.domainId);
  const position = state.wallet.accrual.positions[state.domainId];
  const recentTick = Date.now() - state.lastEpochAt < 3000;
  const diversity = computeResidualDiversity(state.mirror, state.domainId);
  const selfReportedEpoch = state.wallet.accrual.progression.domains[state.domainId]?.epoch ?? 0;
  const consistency = checkCausalConsistency(selfReportedEpoch, state.causalTick, 3);

  root.innerHTML = `
    <div class="top-bar">
      <div style="display:flex; align-items:center; gap:10px"><div class="wordmark">AIWA <em>chain</em></div><a href="https://github.com/theodoreyong9/AIWA_chain" target="_blank" rel="noopener" class="gh-link" title="View source on GitHub">GitHub</a><a href="YELLOWPAPER.pdf" target="_blank" class="gh-link" title="Read the Yellow Paper (PDF)">Yellow Paper</a></div>
      <div style="display:flex; align-items:center; gap:8px">
        <div class="address-chip" id="addr-copy" title="Click to copy">${short(state.domainId, 10)}</div>
        <button class="ghost" id="disconnect-btn" style="padding:5px 10px; font-size:11px">Disconnect</button>
      </div>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="continuum">Continuum</div>
      <div class="tab" data-tab="mirror">Mirror</div>
      <div class="tab" data-tab="ignition">Ignition</div>
    </div>

    <div class="hero">
      <div class="hero-balance ${recentTick ? 'pulse' : ''}">${formatHeroBalance(total)}</div>
      <div class="hero-unit">AIWA</div>
      <div class="status-line">
        <span class="status-dot ${recentTick ? 'continuous' : 'partitioned'}"></span>
        ${recentTick ? 'continuous' : 'idle \u2014 no recent progression'}
      </div>
      <p class="hint" style="margin-top:14px; max-width:340px; margin-left:auto; margin-right:auto">Your own progression needs no connection at all, ever \u2014 it runs anywhere, forever, alone if it has to. Reconciling with another domain needs only some way to move real bytes between you \u2014 never Earth's own network specifically, never any one particular service. Anywhere a real message could physically arrive is enough.</p>
    </div>

    <div class="card">
      <div class="card-title">Position</div>
      <div class="row"><span class="row-label">Committed capital</span><span class="row-value">${position ? position.b : 0} SOL</span></div>
      <div class="row"><span class="row-label">Claimable now</span><span class="row-value">${formatAiwaAmount(claimable)} AIWA</span></div>
      <div class="row"><span class="row-label">Already in wallet</span><span class="row-value">${formatAiwaAmount(spendable)} AIWA</span></div>
      <p class="hint">Claimable + already in wallet = the total above.</p>
      <div class="btn-row">
        <button class="primary" id="claim-btn" ${claimable <= 0n ? 'disabled' : ''}>Claim</button>
      </div>
      <p class="hint">Claiming moves everything currently claimable into your spendable balance, and restarts the patience clock \u2014 the next claim grows from zero again, not from when you first committed.</p>
    </div>

    <div class="card">
      <div class="card-title">Send</div>
      <label class="field-label">To</label>
      <input type="text" id="send-to" placeholder="recipient's AIWA address" />
      <label class="field-label">Amount</label>
      <input type="text" id="send-amount" placeholder="0.000000" />
      <div class="btn-row"><button class="primary" id="send-btn" ${total <= 0n ? 'disabled' : ''}>Send</button></div>
      <div id="send-msg">${lastMsg ?? ''}</div>
    </div>

    <div class="card">
      <div class="card-title">Proof of Irreversibility</div>
      <div class="proof-row">
        <div class="proof-item"><span class="proof-check">\u2713</span> History</div>
        <div class="proof-item"><span class="proof-check">\u2713</span> Commitment</div>
        <div class="proof-item"><span class="proof-check">\u2713</span> Ownership</div>
      </div>
      <p class="hint">Real, verified sequential work behind every epoch; ${diversity.distinctSources} distinct source${diversity.distinctSources === 1 ? '' : 's'} in your own Mirror.</p>
    </div>

    <div class="card">
      <div class="card-title">Causal Tick</div>
      ${state.causalTick ? `
        <div class="row"><span class="row-label">Your own progression</span><span class="row-value">epoch ${selfReportedEpoch}</span></div>
        <div class="row"><span class="row-label">Corroborated by ${state.causalTick.observationCount} real observation${state.causalTick.observationCount === 1 ? '' : 's'}</span><span class="row-value">epoch ${state.causalTick.tick}</span></div>
        <div class="row"><span class="row-label">Real interval across observers</span><span class="row-value">[${state.causalTick.interval[0]}, ${state.causalTick.interval[1]}]</span></div>
        ${state.causalTick.hardwareBackedObservers > 0 ? `<div class="row"><span class="row-label">Hardware-backed observers</span><span class="row-value">${state.causalTick.hardwareBackedObservers} \u2014 an optional, additional signal, never a weight</span></div>` : ''}
        <p class="hint" style="color:${consistency.consistent ? 'var(--moss)' : 'var(--slate)'}">${consistency.consistent ? `Consistent — within ${consistency.gap} epoch${consistency.gap === 1 ? '' : 's'} of what real, weighted external evidence supports.` : `A real gap of ${consistency.gap} epochs from external corroboration \u2014 not proof of anything by itself; you may simply be ahead of your own observers.`}</p>
      ` : `
        <p class="hint">No external evidence yet \u2014 nobody has observed and corroborated your progression. Your own progression stays real and VDF-bound regardless; this is what other domains see once they do.</p>
      `}
    </div>

    <div class="card">
      <div class="card-title">Recent activity</div>
      ${activityLog()}
    </div>

    <div class="card">
      <div class="card-title">Secret key</div>
      <p class="hint">One key, both wallets. ${hasSavedKey() ? 'A saved copy already exists on this device.' : 'Save an encrypted copy so you don\u2019t have to re-enter it.'}</p>
      <label class="field-label">Password</label>
      <input type="password" id="save-pw" placeholder="choose a password" />
      <div class="btn-row"><button id="save-key">Save to this device</button><button class="ghost" id="reveal-key">Reveal raw key</button></div>
      <div id="save-msg"></div>
      <div id="reveal-area"></div>
    </div>
  `;

  root.querySelectorAll('.tab').forEach((el) => el.addEventListener('click', () => { state.activeTab = el.dataset.tab; render(); }));
  root.querySelector('#addr-copy').addEventListener('click', () => navigator.clipboard?.writeText(state.domainId));
  root.querySelector('#disconnect-btn').addEventListener('click', () => {
    if (!confirm('Disconnect from this identity? Your real history stays saved on this device (IndexedDB) and can be restored with your secret key \u2014 this only stops acting as it right now.')) return;
    disconnect();
    render();
  });

  const claimBtn = root.querySelector('#claim-btn');
  if (claimBtn) claimBtn.addEventListener('click', async () => {
    const claimId = crypto.randomUUID();
    const amount = fromUnits(claimable);
    const payload = { type: 'claim', domain: state.domainId, claimId, amount };
    const parents = [state.lastEventId];
    const newId = await state.dag.addEvent(parents, payload);
    state.lastEventId = newId;
    await applyIncremental(newId, parents, payload);
    render();
  });

  root.querySelector('#send-btn').addEventListener('click', () => doSend(root, claims, claimable));

  root.querySelector('#save-key').addEventListener('click', async () => {
    const msgEl = root.querySelector('#save-msg');
    const pw = root.querySelector('#save-pw').value;
    if (!pw) { msgEl.innerHTML = `<div class="msg error">Choose a password first.</div>`; return; }
    await saveCurrentKey(pw);
    msgEl.innerHTML = `<div class="msg ok">Saved, encrypted, on this device.</div>`;
  });
  root.querySelector('#reveal-key').addEventListener('click', () => {
    const bytes = Array.from(state.keypair.secretKey).join(',');
    root.querySelector('#reveal-area').innerHTML = `<textarea readonly style="width:100%;min-height:56px;margin-top:10px;font-size:11px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px">${bytes}</textarea><p class="hint" style="color:#c98167">Anyone with this can act as you. Keep it somewhere real.</p>`;
  });
}

async function doSend(root, claims, accruedUnclaimed) {
  const msgEl = root.querySelector('#send-msg');
  const to = root.querySelector('#send-to').value.trim();
  const raw = root.querySelector('#send-amount').value.trim();
  if (!to) { msgEl.innerHTML = `<div class="msg error">Enter a recipient.</div>`; return; }
  let amount;
  try { amount = toUnits(raw); } catch (e) { msgEl.innerHTML = `<div class="msg error">${e.message}</div>`; return; }
  if (!(amount > 0n)) { msgEl.innerHTML = `<div class="msg error">Enter a positive amount.</div>`; return; }

  const exact = claims.find((c) => c.amount === amount);
  const covering = claims.filter((c) => c.amount > amount).sort((a, b) => (a.amount < b.amount ? -1 : 1))[0];

  try {
    let claimIdToSend;
    if (exact) {
      claimIdToSend = exact.id;
    } else if (accruedUnclaimed >= amount) {
      claimIdToSend = crypto.randomUUID();
      const payload = { type: 'claim', domain: state.domainId, claimId: claimIdToSend, amount: raw };
      const parents = [state.lastEventId];
      const newId = await state.dag.addEvent(parents, payload);
      state.lastEventId = newId;
      await applyIncremental(newId, parents, payload);
    } else if (covering) {
      const firstId = crypto.randomUUID();
      const secondId = crypto.randomUUID();
      const splitEvent = await buildSignedSplitEvent({ claimId: covering.id, owner: state.domainId, firstAmount: raw, firstId, secondId }, state.keypair.secretKey.slice(0, 32), state.keypair.publicKey.toBytes());
      const payload = { type: 'split', ...splitEvent };
      const parents = [state.lastEventId];
      const newId = await state.dag.addEvent(parents, payload);
      state.lastEventId = newId;
      await applyIncremental(newId, parents, payload);
      claimIdToSend = firstId;
    } else {
      msgEl.innerHTML = `<div class="msg error">No single source covers this amount.</div>`;
      return;
    }
    const transferEvent = await buildSignedTransferEvent({ claimId: claimIdToSend, from: state.domainId, to }, state.keypair.secretKey.slice(0, 32), state.keypair.publicKey.toBytes());
    const transferPayload = { type: 'transfer', ...transferEvent };
    const transferParents = [state.lastEventId];
    const transferId = await state.dag.addEvent(transferParents, transferPayload);
    state.lastEventId = transferId;
    await applyIncremental(transferId, transferParents, transferPayload);
    lastMsg = `<div class="msg ok">Sent ${raw}.</div>`;
  } catch (e) {
    lastMsg = `<div class="msg error">${e.message}</div>`;
  }
  render();
}

export function renderContinuum(root) {
  if (!state.domainId) noIdentity(root);
  else activeContinuum(root);
}
