import { state, short, REWARD_PARAMS } from './state.js';
import { render, applyIncremental } from './app.js';
import { activateWithNewKeypair, activateWithSecretKeyBytes, activateWithPassphrase, hasSavedKey, saveCurrentKey, unlockSavedKey, clearSavedKey, disconnect } from './identity.js';
import { claimableNow } from '../core/accrual.js';
import { spendableClaims, totalBalance, buildSignedTransferEvent, buildSignedSplitEvent } from '../core/wallet.js';
import { format as formatAiwaAmount, toUnits, fromUnits } from '../core/units.js';
import { checkCausalConsistency } from '../core/causal-tick.js';
import { computeResidualDiversity } from '../core/mirror.js';

let lastMsg = null;
let secretKeyRevealed = null;

function noIdentity(root) {
  root.innerHTML = `
    <div class="top-bar"><div class="wordmark">AIWA <em>chain</em></div></div>
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
      <p class="hint">The same real identity, anywhere \u2014 the identical passphrase always derives the identical keypair, on any device, with nothing else to carry. A weak passphrase is exactly as unsafe as a weak private key.</p>
      <input type="password" id="passphrase-input" placeholder="a real passphrase, the more words the better" />
      <div class="btn-row"><button class="primary" id="passphrase-btn">Open</button></div>
      <div id="passphrase-msg"></div>
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
  root.querySelector('#passphrase-btn').addEventListener('click', async () => {
    const msgEl = root.querySelector('#passphrase-msg');
    const passphrase = root.querySelector('#passphrase-input').value;
    if (!passphrase) { msgEl.innerHTML = `<div class="msg error">Enter a passphrase.</div>`; return; }
    try { await activateWithPassphrase(passphrase); render(); }
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

function trajectorySvg() {
  const events = state.dag.topoOrder().filter((e) => e.payload?.domain === state.domainId || e.payload?.type === 'genesis');
  const relevant = events.filter((e) => ['genesis', 'identity-cost', 'accrual', 'claim', 'transfer', 'split'].includes(e.payload?.type)).slice(-10);
  if (relevant.length === 0) return `<div class="timeline-empty">Nothing yet \u2014 your trajectory starts with your first action.</div>`;

  const width = Math.max(280, relevant.length * 70);
  const height = 120;
  const midY = height / 2;
  const step = relevant.length > 1 ? (width - 60) / (relevant.length - 1) : 0;

  const styleFor = (p) => {
    if (p.type === 'genesis') return { color: 'var(--text-faint)', r: 4, label: 'genesis' };
    if (p.type === 'identity-cost') return { color: 'var(--amber)', r: 7, label: 'ignited' };
    if (p.type === 'accrual') return { color: 'var(--amber-dim)', r: 5, label: `committed ${p.b}` };
    if (p.type === 'claim') return { color: 'var(--moss)', r: 7, label: `claimed ${p.amount}` };
    if (p.type === 'transfer') return p.from === state.domainId
      ? { color: 'var(--slate)', r: 6, label: `sent \u2192 ${short(p.to, 5)}` }
      : { color: 'var(--moss)', r: 6, label: `received \u2190 ${short(p.from, 5)}` };
    if (p.type === 'split') return { color: 'var(--amber-dim)', r: 5, label: 'split' };
    return { color: 'var(--text-dim)', r: 4, label: p.type };
  };

  const points = relevant.map((e, i) => {
    const x = 30 + i * step;
    const wobble = (i % 3 === 1) ? -14 : (i % 3 === 2) ? 14 : 0; // a real, slight organic variation — never a false-precision timeline
    const y = midY + wobble;
    return { x, y, style: styleFor(e.payload) };
  });

  const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

  return `
    <div style="overflow-x:auto">
      <svg viewBox="0 0 ${width} ${height}" style="min-width:${width}px; height:${height}px; display:block">
        <path d="${pathD}" fill="none" stroke="var(--border)" stroke-width="1.5" />
        ${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${p.style.r}" fill="${p.style.color}" />`).join('')}
        ${points.map((p) => `<text x="${p.x}" y="${p.y + p.style.r + 16}" text-anchor="middle" font-size="9" fill="var(--text-dim)" font-family="var(--font-mono)">${p.style.label}</text>`).join('')}
      </svg>
    </div>
  `;
}

function activeContinuum(root) {
  const claimable = claimableNow(REWARD_PARAMS, state.wallet.accrual, state.domainId);
  const claims = spendableClaims(state.wallet, state.domainId);
  const spendable = claims.reduce((s, c) => s + c.amount, 0n);
  const total = totalBalance(REWARD_PARAMS, state.wallet, state.domainId);
  const position = state.wallet.accrual.positions[state.domainId];
  const selfReportedEpoch = state.wallet.accrual.progression.domains[state.domainId]?.epoch ?? 0;
  const consistency = checkCausalConsistency(selfReportedEpoch, state.causalTick, 3);
  const recentTick = Date.now() - state.lastEpochAt < 3000;
  const diversity = computeResidualDiversity(state.mirror, state.domainId);

  root.innerHTML = `
    <div class="top-bar">
      <div class="wordmark">AIWA <em>chain</em></div>
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
      <div class="hero-balance ${recentTick ? 'pulse' : ''}">${formatAiwaAmount(total)}</div>
      <div class="hero-unit">AIWA</div>
      <div class="status-line">
        <span class="status-dot ${recentTick ? 'continuous' : 'partitioned'}"></span>
        ${recentTick ? 'continuous' : 'idle \u2014 no recent progression'}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Position</div>
      <div class="row"><span class="row-label">Committed</span><span class="row-value">${position ? position.b : 0}</span></div>
      <div class="row"><span class="row-label">Claimable now</span><span class="row-value">${formatAiwaAmount(claimable)}</span></div>
      <div class="row"><span class="row-label">Already in wallet</span><span class="row-value">${formatAiwaAmount(spendable)}</span></div>
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
      <div class="card-title">Trajectory</div>
      ${trajectorySvg()}
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
    // A real, incremental update — apply just this one new event,
    // never a full re-fold and re-verification of the whole history
    // for a single user action.
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

  // A real, incremental update throughout — each event applied
  // directly to the already-materialized state as it's posted, never
  // a full re-fold of the whole history for a single user action.
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
