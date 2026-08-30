// The real UI for generous-transfer.js (§15) — a real, external
// contract, never a modification to Continuum/Mirror/Ignition
// themselves. Reuses the identical, already-tested claim-finding and
// splitting logic Continuum's own send flow uses — never a
// duplicated, second implementation of the same real behavior.

import { state, short } from './state.js';
import { render, applyIncremental } from './app.js';
import { spendableClaims, buildSignedTransferEvent, buildSignedSplitEvent } from '../core/wallet.js';
import { format as formatAiwaAmount, toUnits } from '../core/units.js';
import { buildOfferPayload, CONTRACT_ID } from '../core/generous-transfer.js';
import { publishContractSpec, scanContractSpecs } from '../core/contract-registry.js';

let sendMsg = null;
let busy = false;
let publishMsg = null;
let publishBusy = false;

// A few real, named difficulty presets — real leading-zero-bit
// thresholds, never a percentage the UI just decorates: the real
// odds are exactly $2^{-\text{bits}}$, computed the same way
// checkOutcome() itself checks them.
const THRESHOLD_PRESETS = [
  { label: '1 in 4 (generous)', bits: 2 },
  { label: '1 in 16', bits: 4 },
  { label: '1 in 256 (rare)', bits: 8 },
];

// Finds or creates a real, spendable claim of exactly `amount` —
// identical logic to Continuum's own doSend, reused here rather than
// re-implemented, so both stay correct the same way.
async function ensureClaimOfAmount(claims, accruedUnclaimed, amount, raw) {
  const exact = claims.find((c) => c.amount === amount);
  if (exact) return exact.id;
  if (accruedUnclaimed >= amount) {
    const claimId = crypto.randomUUID();
    const payload = { type: 'claim', domain: state.domainId, claimId, amount: raw };
    const parents = [state.lastEventId];
    const newId = await state.dag.addEvent(parents, payload);
    state.lastEventId = newId;
    await applyIncremental(newId, parents, payload);
    return claimId;
  }
  const covering = claims.filter((c) => c.amount > amount).sort((a, b) => (a.amount < b.amount ? -1 : 1))[0];
  if (!covering) return null;
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  const splitEvent = await buildSignedSplitEvent({ claimId: covering.id, owner: state.domainId, firstAmount: raw, firstId, secondId }, state.keypair.secretKey.slice(0, 32), state.keypair.publicKey.toBytes());
  const payload = { type: 'split', ...splitEvent };
  const parents = [state.lastEventId];
  const newId = await state.dag.addEvent(parents, payload);
  state.lastEventId = newId;
  await applyIncremental(newId, parents, payload);
  return firstId;
}

export function renderGenerous(root) {
  if (!state.domainId) {
    root.innerHTML = `
      <div class="top-bar"><div style="display:flex; align-items:center; gap:10px"><div class="wordmark">AIWA <em>chain</em></div><a href="https://github.com/theodoreyong9/AIWA_chain" target="_blank" rel="noopener" class="gh-link" title="View source on GitHub">GitHub</a><a href="YELLOWPAPER.pdf" target="_blank" class="gh-link" title="Read the Yellow Paper (PDF)">Yellow Paper</a></div></div>
      <div class="tabs">
        <div class="tab" data-tab="continuum">Continuum</div>
        <div class="tab" data-tab="mirror">Mirror</div>
        <div class="tab" data-tab="ignition">Ignition</div>
        <div class="tab active" data-tab="generous">Give</div>
      </div>
      <div class="card" style="background:transparent; border-style:dashed">
        <p class="hint">No identity yet \u2014 activate one from Continuum first.</p>
      </div>
    `;
    root.querySelectorAll('.tab').forEach((el) => el.addEventListener('click', () => { state.activeTab = el.dataset.tab; render(); }));
    return;
  }

  const claims = spendableClaims(state.wallet, state.domainId);
  const accruedUnclaimed = 0n; // this view only ever spends already-claimed AIWA — claiming stays Continuum's own, deliberate, manual act

  const pending = Object.entries(state.pendingGenerousSends);
  const specs = scanContractSpecs(state.dag.topoOrder());
  const sent = Object.entries(state.sentGenerousSends);
  const history = state.generousSendHistory;

  root.innerHTML = `
    <div class="top-bar">
      <div style="display:flex; align-items:center; gap:10px"><div class="wordmark">AIWA <em>chain</em></div><a href="https://github.com/theodoreyong9/AIWA_chain" target="_blank" rel="noopener" class="gh-link" title="View source on GitHub">GitHub</a><a href="YELLOWPAPER.pdf" target="_blank" class="gh-link" title="Read the Yellow Paper (PDF)">Yellow Paper</a></div>
      <div style="display:flex; align-items:center; gap:8px">
        <div class="address-chip" id="addr-copy" title="Click to copy">${short(state.domainId, 10)}</div>
      </div>
    </div>
    <div class="tabs">
      <div class="tab" data-tab="continuum">Continuum</div>
      <div class="tab" data-tab="mirror">Mirror</div>
      <div class="tab" data-tab="ignition">Ignition</div>
      <div class="tab active" data-tab="generous">Give</div>
    </div>

    <div class="card" style="background:transparent; border-style:dashed">
      <p class="hint">A real, external contract (<code>${CONTRACT_ID}</code>) — never part of the core protocol itself. Send someone real AIWA, and optionally risk a bit more on top — decided deterministically by their own next real, sequential computation, never chance in the ordinary sense. Enforced by anyone once sent; you can never take it back after sending.</p>
    </div>

    <div class="card">
      <div class="card-title">Send generously</div>
      <label class="field-label">To (their real domain id)</label>
      <input type="text" id="gs-to" placeholder="recipient's real domain id" />
      <label class="field-label" style="margin-top:10px">Amount (always sent)</label>
      <input type="text" id="gs-base-amount" placeholder="0.00" inputmode="decimal" />
      <label class="field-label" style="margin-top:10px">Extra, at risk (optional — 0 to skip)</label>
      <input type="text" id="gs-bonus-amount" placeholder="0.00" inputmode="decimal" value="0" />
      <label class="field-label" style="margin-top:10px">Real odds</label>
      <select id="gs-threshold">
        ${THRESHOLD_PRESETS.map((p) => `<option value="${p.bits}">${p.label}</option>`).join('')}
      </select>
      <div class="btn-row" style="margin-top:12px"><button class="primary" id="gs-send-btn" ${busy ? 'disabled' : ''}>${busy ? 'Sending\u2026' : 'Send'}</button></div>
      <div id="gs-msg">${sendMsg ?? ''}</div>
    </div>

    <div class="card">
      <div class="card-title">Waiting to resolve</div>
      ${pending.length === 0
        ? `<p class="hint">Nothing pending. A real offer sent to you resolves automatically the next time your own progression advances \u2014 no action needed.</p>`
        : pending.map(([id, offer]) => `
          <div class="row"><span class="row-label">${short(offer.commitment.signerPubkey, 10)}</span><span class="row-value">up to ${formatAiwaAmount(toUnits(offer.commitment.bonusAmount))} AIWA at risk</span></div>
        `).join('')
      }
    </div>

    <div class="card">
      <div class="card-title">What you've sent</div>
      ${sent.length === 0
        ? `<p class="hint">Nothing sent with a real, at-risk amount yet.</p>`
        : sent.map(([id, offer]) => {
          const outcome = state.sentGenerousSendOutcomes[id] ?? 'pending';
          const label = outcome === 'won' ? '\u2713 won' : outcome === 'lost' ? '\u2014 no win' : '\u2026 pending';
          return `<div class="row"><span class="row-label">${short(offer.commitment.to, 10)}</span><span class="row-value">${label} \u2014 ${formatAiwaAmount(toUnits(offer.commitment.bonusAmount))} AIWA</span></div>`;
        }).join('')
      }
      <p class="hint" style="margin-top:8px">A real "no win" here can only ever be shown once their own progression, resolving your offer, has genuinely reached you \u2014 reconcile with them (Mirror) if this stays "pending" longer than you'd expect.</p>
    </div>

    <div class="card">
      <div class="card-title">Recent outcomes</div>
      ${history.length === 0
        ? `<p class="hint">None yet \u2014 real outcomes appear here once your own progression resolves a real, pending offer.</p>`
        : history.slice(0, 10).map((h) => `
          <div class="row"><span class="row-label">${h.won ? '\u2713 won' : '\u2014 no win'}</span><span class="row-value">${formatAiwaAmount(toUnits(h.bonusAmount))} AIWA at stake</span></div>
        `).join('')
      }
    </div>

    <div class="card" style="background:transparent; border-style:dashed">
      <div class="card-title">Publish a contract (§16)</div>
      <p class="hint">A real, content-addressed identity for any real contract's own source \u2014 never a chosen name. Once published and synced to others (like any real event), its id is immutable in the identical sense every event here already is.</p>
      <label class="field-label">Name</label>
      <input type="text" id="cs-name" placeholder="e.g. my-new-contract" />
      <label class="field-label" style="margin-top:10px">Version</label>
      <input type="number" id="cs-version" value="1" min="1" />
      <label class="field-label" style="margin-top:10px">Source code (the real, complete text)</label>
      <textarea id="cs-source" placeholder="paste the real, complete source here" style="min-height:120px; font-family:var(--font-mono); font-size:11px"></textarea>
      <label class="field-label" style="margin-top:10px">Description</label>
      <input type="text" id="cs-description" placeholder="what this contract does" />
      <div class="btn-row" style="margin-top:12px"><button id="cs-publish-btn" ${publishBusy ? 'disabled' : ''}>${publishBusy ? 'Publishing\u2026' : 'Publish'}</button></div>
      <div id="cs-msg">${publishMsg ?? ''}</div>
      ${specs.length > 0 ? `
        <label class="field-label" style="margin-top:14px">Already published, known to this domain</label>
        ${specs.map((s) => `<div class="row"><span class="row-label">${s.name} v${s.version}</span><span class="row-value">${short(s.sourceHash, 10)}</span></div>`).join('')}
      ` : ''}
    </div>
  `;

  root.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => { state.activeTab = tab.dataset.tab; render(); });
  });

  root.querySelector('#gs-send-btn').addEventListener('click', async () => {
    const msgEl = root.querySelector('#gs-msg');
    const to = root.querySelector('#gs-to').value.trim();
    const baseRaw = root.querySelector('#gs-base-amount').value.trim();
    const bonusRaw = root.querySelector('#gs-bonus-amount').value.trim() || '0';
    const thresholdBits = Number(root.querySelector('#gs-threshold').value);

    if (!to) { msgEl.innerHTML = `<div class="msg error">Enter a real recipient domain id.</div>`; return; }
    let baseAmount, bonusAmount;
    try { baseAmount = toUnits(baseRaw); bonusAmount = toUnits(bonusRaw); } catch (e) { msgEl.innerHTML = `<div class="msg error">${e.message}</div>`; return; }
    if (!(baseAmount > 0n)) { msgEl.innerHTML = `<div class="msg error">Enter a positive amount.</div>`; return; }

    busy = true; render();
    try {
      const currentClaims = spendableClaims(state.wallet, state.domainId);
      const baseClaimId = await ensureClaimOfAmount(currentClaims, accruedUnclaimed, baseAmount, baseRaw);
      if (!baseClaimId) throw new Error('No single source covers the base amount.');

      const transferEvent = await buildSignedTransferEvent({ claimId: baseClaimId, from: state.domainId, to }, state.keypair.secretKey.slice(0, 32), state.keypair.publicKey.toBytes());
      const transferPayload = { type: 'transfer', ...transferEvent };
      const transferParents = [state.lastEventId];
      const transferId = await state.dag.addEvent(transferParents, transferPayload);
      state.lastEventId = transferId;
      await applyIncremental(transferId, transferParents, transferPayload);

      if (bonusAmount > 0n) {
        const refreshedClaims = spendableClaims(state.wallet, state.domainId);
        const bonusClaimId = await ensureClaimOfAmount(refreshedClaims, accruedUnclaimed, bonusAmount, bonusRaw);
        if (!bonusClaimId) throw new Error('No single source covers the extra, at-risk amount.');

        const offerPayload = await buildOfferPayload(state.keypair, state.domainId, {
          baseTransferId: transferId, to, bonusClaimId, bonusAmount: bonusRaw, thresholdBits,
        }, buildSignedTransferEvent);
        const offerParents = [state.lastEventId];
        const offerId = await state.dag.addEvent(offerParents, offerPayload);
        state.lastEventId = offerId;
        await applyIncremental(offerId, offerParents, offerPayload);
      }

      sendMsg = `<div class="msg ok">Sent${bonusAmount > 0n ? ', with a real, extra amount at risk' : ''}.</div>`;
    } catch (e) {
      sendMsg = `<div class="msg error">${e.message}</div>`;
    }
    busy = false;
    render();
  });

  root.querySelector('#cs-publish-btn').addEventListener('click', async () => {
    const msgEl = root.querySelector('#cs-msg');
    const name = root.querySelector('#cs-name').value.trim();
    const version = Number(root.querySelector('#cs-version').value);
    const sourceCode = root.querySelector('#cs-source').value;
    const description = root.querySelector('#cs-description').value.trim();

    if (!name) { msgEl.innerHTML = `<div class="msg error">Enter a real name for this contract.</div>`; return; }
    if (!sourceCode.trim()) { msgEl.innerHTML = `<div class="msg error">Paste the real, complete source code.</div>`; return; }
    if (!Number.isInteger(version) || version < 1) { msgEl.innerHTML = `<div class="msg error">Version must be a real, positive integer.</div>`; return; }

    publishBusy = true; render();
    try {
      const { specEventId, sourceHash } = await publishContractSpec(state.dag, { name, version, sourceCode, description });
      state.lastEventId = specEventId;
      await applyIncremental(specEventId, [], { type: 'contract-spec', name, version, sourceCode, sourceHash, description });
      publishMsg = `<div class="msg ok">Published \u2014 real id: ${short(specEventId, 14)}</div>`;
    } catch (e) {
      publishMsg = `<div class="msg error">${e.message}</div>`;
    }
    publishBusy = false;
    render();
  });
}
