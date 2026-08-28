import { state, short } from './state.js';
import { render, rematerialize } from './app.js';
import { exportHistory, importHistory, buildReceptionCommitment } from './reconciliation.js';
import { disconnect } from './identity.js';
import { computeResidualDiversity, deriveSourceEpochLookup } from '../core/mirror.js';
import { P2PConnection } from './p2p-connection.js';

let lastMsg = null;

// Real, live connection state — one connection at a time, kept
// module-level so it survives re-renders.
let p2pConnection = null;
let p2pStatus = 'idle'; // 'idle' | 'awaiting-answer' | 'awaiting-completion' | 'open' | 'closed'
let p2pOfferBlob = null;
let p2pAnswerBlob = null;
let p2pSyncedCount = 0;
let p2pMsg = null;
let pendingIncomingOffer = null; // a real offer blob arrived via a scanned QR's own URL, ready to pre-fill

// Called once, right after boot, if a real offer blob arrived via a
// scanned QR code's own URL — switches to Mirror and pre-fills the
// accept field, so scanning is the only real step needed before
// clicking Accept.
export function applyIncomingOfferFromHash(blob) {
  pendingIncomingOffer = blob;
  state.activeTab = 'mirror';
}

// Real domains this identity has actually, verifiably committed to
// having observed — read from state.mirror's own real reception
// commitments, never a raw scan of every progression event sitting in
// local storage. Without this distinction, a domain's OWN earlier,
// disconnected-from identity (its progression events never removed
// from this same browser's IndexedDB) would appear as a genuinely
// "observed" external domain, which it never was. This is what the
// entropic-space chart shows.
function verifiedObservedDomains() {
  const seen = new Map();
  const lookup = deriveSourceEpochLookup(state.dag.topoOrder());
  const myCommitments = state.mirror?.commitments?.[state.domainId] ?? [];
  for (const commitment of myCommitments) {
    for (const ref of commitment.receivedFrom) {
      if (ref.sourceDomain === state.domainId) continue;
      if (lookup(ref.sourceDomain, ref.eventId) === null) continue;
      const entry = seen.get(ref.sourceDomain) ?? { lastEventId: null, eventCount: 0 };
      entry.lastEventId = ref.eventId;
      entry.eventCount += 1;
      seen.set(ref.sourceDomain, entry);
    }
  }
  return seen;
}

// Domains genuinely brought in via a real import (state.importedDomains,
// populated only by reconciliation.js's own importHistory — never a
// raw DAG scan), minus ones already committed. This is the "you could
// commit to these" list.
function pendingImportDomains() {
  const alreadyCommitted = verifiedObservedDomains();
  const pending = new Map();
  for (const domainId of state.importedDomains) {
    if (domainId === state.domainId || alreadyCommitted.has(domainId)) continue;
    const progressionEvents = state.dag.topoOrder().filter((e) => e.payload?.type === 'progression' && e.payload?.domain === domainId);
    if (progressionEvents.length === 0) continue;
    const last = progressionEvents[progressionEvents.length - 1];
    pending.set(domainId, { lastEventId: last.id, eventCount: progressionEvents.length });
  }
  return pending;
}

function angleFor(domainId) {
  let h = 0;
  for (const ch of domainId) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (h / 360) * 2 * Math.PI;
}

function entropicSpaceSvg(domains) {
  const size = 320;
  const center = size / 2;
  const maxRadius = center - 40;
  if (domains.size === 0) {
    return `<div class="empty-state" style="padding:30px 10px"><div class="glyph">\u25CB</div>No domains observed yet \u2014 import a real history file, or connect live, to populate this.</div>`;
  }
  const maxCount = Math.max(...[...domains.values()].map((d) => d.eventCount));
  const nodes = [...domains.entries()].map(([domainId, info]) => {
    const angle = angleFor(domainId);
    const knownFraction = info.eventCount / maxCount;
    const radius = maxRadius * (1 - knownFraction * 0.75);
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return { domainId, x, y, eventCount: info.eventCount };
  });
  const edges = nodes.map((n) => `<line x1="${center}" y1="${center}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" stroke="var(--border)" stroke-width="1" />`).join('');
  const points = nodes.map((n) => `
    <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${6 + Math.min(10, n.eventCount)}" fill="var(--amber)" fill-opacity="0.75" stroke="var(--amber)" />
    <text x="${n.x.toFixed(1)}" y="${(n.y + 22).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--text-dim)" font-family="var(--font-mono)">${short(n.domainId, 6)}</text>
  `).join('');
  return `
    <svg viewBox="0 0 ${size} ${size}" style="width:100%; max-width:340px; display:block; margin:0 auto">
      ${edges}
      <circle cx="${center}" cy="${center}" r="10" fill="var(--text)" />
      <text x="${center}" y="${center - 16}" text-anchor="middle" font-size="10" fill="var(--text)" font-family="var(--font-mono)">you</text>
      ${points}
    </svg>
  `;
}

// A real QR code encoding a real URL, so scanning it with a phone's
// own camera app opens this site directly with the offer/answer
// pre-filled — no manual copy-paste needed on the scanning side. QR
// codes have a real, hard data-capacity limit (~2900 characters at
// low error correction); a real WebRTC offer with many real ICE
// candidates can exceed that, so this returns null (never throws)
// above a safe threshold, and callers fall back to the always-real
// text copy/paste, which has no such limit.
let qrModule = null;
async function generateQrSvg(kind, blob) {
  const url = `${location.origin}${location.pathname}#p2p-${kind}=${encodeURIComponent(blob)}`;
  if (url.length > 2400) return null;
  try {
    if (!qrModule) qrModule = await import('qrcode');
    return await qrModule.default.toString(url, { type: 'svg', errorCorrectionLevel: 'L', margin: 1 });
  } catch {
    return null; // a real, unexpected QR failure — never fatal, text fallback remains
  }
}

function p2pStatusHtml() {
  if (p2pStatus === 'open') {
    return `
      <div class="status-line"><span class="status-dot continuous"></span>Connected \u2014 syncing live</div>
      <p class="hint">${p2pSyncedCount} real event${p2pSyncedCount === 1 ? '' : 's'} synced automatically since connecting.</p>
      <div class="btn-row"><button class="ghost" id="p2p-close-btn">Disconnect</button></div>
    `;
  }
  if (p2pStatus === 'awaiting-answer') {
    return `
      <p class="hint">On another device: scan this to open the connection directly \u2014 or send the text below by hand.</p>
      <div id="p2p-offer-qr" style="text-align:center; margin:10px 0"></div>
      <textarea id="p2p-offer-display" readonly style="min-height:70px; font-size:10px">${p2pOfferBlob}</textarea>
      <div class="btn-row"><button id="p2p-copy-offer">Copy</button></div>
      <label class="field-label" style="margin-top:14px">Their answer</label>
      <textarea id="p2p-answer-input" placeholder="paste what they send back here, or it'll fill in automatically if they scan your QR and send theirs back the same way" style="min-height:70px; font-size:10px"></textarea>
      <div class="btn-row"><button class="primary" id="p2p-complete-btn">Complete connection</button><button class="ghost" id="p2p-cancel-btn">Cancel</button></div>
      <div id="p2p-msg">${p2pMsg ?? ''}</div>
    `;
  }
  if (p2pStatus === 'awaiting-completion') {
    return `
      <p class="hint">Scan this on their device, or send the text below by hand \u2014 either way, the connection completes automatically once it reaches them.</p>
      <div id="p2p-answer-qr" style="text-align:center; margin:10px 0"></div>
      <textarea id="p2p-answer-display" readonly style="min-height:70px; font-size:10px">${p2pAnswerBlob}</textarea>
      <div class="btn-row"><button id="p2p-copy-answer">Copy</button><button class="ghost" id="p2p-cancel-btn">Cancel</button></div>
    `;
  }
  return `
    <p class="hint">Exactly like a phone call: one of you calls, the other answers \u2014 doesn't matter who. Calling: click Start, send the resulting text to the other person, then paste back the answer they send you. Answering: paste the text they sent you below, click Accept, then send back the answer this produces.</p>
    <div class="btn-row"><button class="primary" id="p2p-start-btn">Start a connection (call)</button></div>
    <label class="field-label" style="margin-top:14px">Or answer someone else's call</label>
    ${pendingIncomingOffer ? '<p class="hint" style="color:var(--moss)">A real offer arrived from a scanned QR \u2014 already filled in below. Just click Accept.</p>' : ''}
    <textarea id="p2p-offer-input" placeholder="paste the text they sent you here" style="min-height:70px; font-size:10px">${pendingIncomingOffer ?? ''}</textarea>
    <div class="btn-row"><button id="p2p-accept-btn">Accept</button></div>
    <div id="p2p-msg">${p2pMsg ?? ''}</div>
  `;
}

function startP2PConnection() {
  p2pConnection = new P2PConnection(state.dag, state.domainId, {
    onStatusChange: (status) => {
      if (status === 'open') { p2pStatus = 'open'; p2pSyncedCount = 0; }
      else if (status === 'closed') { p2pStatus = 'idle'; p2pConnection = null; }
      render();
    },
    onSyncEvent: async (kind, result) => {
      p2pSyncedCount += result.imported;
      if (result.imported > 0) await rematerialize();
      render();
    },
  });
  return p2pConnection;
}

export function renderMirror(root) {
  if (!state.domainId) {
    root.innerHTML = `
      <div class="top-bar"><div style="display:flex; align-items:center; gap:10px"><div class="wordmark">AIWA <em>chain</em></div><a href="https://github.com/theodoreyong9/AIWA_chain" target="_blank" rel="noopener" class="gh-link" title="View source on GitHub">GitHub</a><a href="YELLOWPAPER.pdf" target="_blank" class="gh-link" title="Read the Yellow Paper (PDF)">Yellow Paper</a></div></div>
      <div class="tabs">
        <div class="tab" data-tab="continuum">Continuum</div>
        <div class="tab active" data-tab="mirror">Mirror</div>
        <div class="tab" data-tab="ignition">Ignition</div>
      </div>
      <div class="empty-state"><div class="glyph">\u25CB</div>No identity yet \u2014 create one in Continuum first.</div>
    `;
    root.querySelectorAll('.tab').forEach((el) => el.addEventListener('click', () => { state.activeTab = el.dataset.tab; render(); }));
    return;
  }

  const verifiedDomains = verifiedObservedDomains();
  const pendingDomains = pendingImportDomains();
  const myEpoch = state.wallet.accrual.progression.domains[state.domainId]?.epoch ?? 0;
  const corroboratedEpoch = state.causalTick?.tick ?? 0;
  const unobservedEpochs = Math.max(0, myEpoch - corroboratedEpoch);

  root.innerHTML = `
    <div class="top-bar">
      <div style="display:flex; align-items:center; gap:10px"><div class="wordmark">AIWA <em>chain</em></div><a href="https://github.com/theodoreyong9/AIWA_chain" target="_blank" rel="noopener" class="gh-link" title="View source on GitHub">GitHub</a><a href="YELLOWPAPER.pdf" target="_blank" class="gh-link" title="Read the Yellow Paper (PDF)">Yellow Paper</a></div>
      <div style="display:flex; align-items:center; gap:8px">
        <div class="address-chip" id="addr-copy" title="Click to copy">${short(state.domainId, 10)}</div>
        <button class="ghost" id="disconnect-btn" style="padding:5px 10px; font-size:11px">Disconnect</button>
      </div>
    </div>
    <div class="tabs">
      <div class="tab" data-tab="continuum">Continuum</div>
      <div class="tab active" data-tab="mirror">Mirror</div>
      <div class="tab" data-tab="ignition">Ignition</div>
    </div>

    <div class="card" style="border-color:${unobservedEpochs > 0 ? 'var(--amber-dim)' : 'var(--border)'}">
      <div class="card-title">Real, current visibility</div>
      ${unobservedEpochs > 0
        ? `<p class="hint">${myEpoch} real epochs computed, but only ${corroboratedEpoch} corroborated by anyone else \u2014 <strong style="color:var(--amber)">${unobservedEpochs} epoch${unobservedEpochs === 1 ? '' : 's'} nobody has seen yet</strong>. Still fully real and yours; just not witnessed. Connect below to change that.</p>`
        : myEpoch > 0
          ? `<p class="hint" style="color:var(--moss)">All ${myEpoch} of your real epochs are corroborated by at least one other domain.</p>`
          : `<p class="hint">No real progression yet \u2014 nothing to observe.</p>`
      }
    </div>

    <div class="card">
      <div class="card-title">Entropic space</div>
      <p class="hint">Not geography \u2014 distance here is how little this domain actually knows about another, computed from real, imported or synced history. Never a claim about where anything physically is.</p>
      ${(() => {
        const diversity = computeResidualDiversity(state.mirror, state.domainId);
        return diversity.distinctSources > 0
          ? `<div class="row"><span class="row-label">Your own residual diversity</span><span class="row-value">H=${diversity.entropy.toFixed(2)} across ${diversity.distinctSources} source${diversity.distinctSources === 1 ? '' : 's'}</span></div>`
          : '';
      })()}
      ${entropicSpaceSvg(verifiedDomains)}
    </div>

    <div class="card">
      <div class="card-title">Live connection</div>
      <p class="hint">The channel is temporary; what moves through it isn't. Anything received here is verified and saved locally, for good \u2014 closing this tab never erases it. What ends when a tab closes is only this specific live link, exactly like a real interplanetary link goes quiet during a real blackout: reconnecting later means re-establishing contact, never losing what each side already knew before. There's no directory or discovery yet \u2014 for now, joining the wider mesh means someone already on it invites you in, and if they're simultaneously connected to others, you get their real-time updates too, transitively, for as long as all three stay connected.</p>
      ${p2pStatusHtml()}
    </div>

    <div class="card">
      <div class="card-title">Reconciliation by file</div>
      <p class="hint">The fallback when a live connection isn't possible right now \u2014 carried by hand, like a physically transported drive. This file contains real, verifiable proof of your own progression too \u2014 but never your secret key. Importing it elsewhere lets that device know your history happened; it can never act as you (claim, send) without your key or passphrase separately.</p>
      <div class="btn-row"><button id="export-btn">Export your history</button></div>
      <label class="field-label" style="margin-top:14px">Import a real history file</label>
      <input type="file" id="import-file" accept="application/json" />
      <div class="btn-row"><button id="import-btn">Import</button></div>
      <div id="reconcile-msg">${lastMsg ?? ''}</div>
    </div>

    <div class="card">
      <div class="card-title">Imported, not yet committed (${pendingDomains.size})</div>
      <p class="hint">Real history now present locally from an import or a live sync \u2014 committing signs a real, verifiable statement that you've actually seen it.</p>
      ${pendingDomains.size === 0 ? '<div class="hint">None yet.</div>' : [...pendingDomains.entries()].map(([d, info]) => `
        <div class="list-row">
          <div style="flex:1"><div class="mono-id">${short(d, 16)}</div><div class="hint">${info.eventCount} real event${info.eventCount === 1 ? '' : 's'} known</div></div>
          <button data-commit="${d}">Commit reception</button>
        </div>
      `).join('')}
    </div>
  `;

  root.querySelectorAll('.tab').forEach((el) => el.addEventListener('click', () => { state.activeTab = el.dataset.tab; render(); }));
  root.querySelector('#addr-copy').addEventListener('click', () => navigator.clipboard?.writeText(state.domainId));
  root.querySelector('#disconnect-btn').addEventListener('click', () => {
    if (!confirm('Disconnect from this identity? Your real history stays saved on this device (IndexedDB) and can be restored with your secret key \u2014 this only stops acting as it right now.')) return;
    disconnect();
    render();
  });

  const startBtn = root.querySelector('#p2p-start-btn');
  if (startBtn) startBtn.addEventListener('click', async () => {
    const msgEl = root.querySelector('#p2p-msg');
    try {
      const conn = startP2PConnection();
      p2pOfferBlob = await conn.createOffer();
      p2pStatus = 'awaiting-answer';
      render();
    } catch (e) {
      if (msgEl) msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
    }
  });
  const acceptBtn = root.querySelector('#p2p-accept-btn');
  if (acceptBtn) acceptBtn.addEventListener('click', async () => {
    const msgEl = root.querySelector('#p2p-msg');
    const offerBlob = root.querySelector('#p2p-offer-input').value.trim();
    if (!offerBlob) { msgEl.innerHTML = `<div class="msg error">Paste a real offer first.</div>`; return; }
    pendingIncomingOffer = null;
    try {
      const conn = startP2PConnection();
      p2pAnswerBlob = await conn.acceptOfferAndCreateAnswer(offerBlob);
      p2pStatus = 'awaiting-completion';
      render();
    } catch (e) {
      msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
    }
  });
  const completeBtn = root.querySelector('#p2p-complete-btn');
  if (completeBtn) completeBtn.addEventListener('click', async () => {
    const msgEl = root.querySelector('#p2p-msg');
    const answerBlob = root.querySelector('#p2p-answer-input').value.trim();
    if (!answerBlob) { msgEl.innerHTML = `<div class="msg error">Paste their real answer first.</div>`; return; }
    try {
      await p2pConnection.completeWithAnswer(answerBlob);
    } catch (e) {
      msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
    }
  });
  const copyOfferBtn = root.querySelector('#p2p-copy-offer');
  if (copyOfferBtn) copyOfferBtn.addEventListener('click', () => navigator.clipboard?.writeText(p2pOfferBlob));
  const copyAnswerBtn = root.querySelector('#p2p-copy-answer');
  if (copyAnswerBtn) copyAnswerBtn.addEventListener('click', () => navigator.clipboard?.writeText(p2pAnswerBlob));
  const cancelBtn = root.querySelector('#p2p-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    if (p2pConnection) p2pConnection.close();
    p2pStatus = 'idle';
    p2pConnection = null;
    render();
  });
  const closeBtn = root.querySelector('#p2p-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    if (p2pConnection) p2pConnection.close();
  });

  root.querySelector('#export-btn').addEventListener('click', () => {
    const count = exportHistory(state.dag, state.domainId);
    lastMsg = `<div class="msg ok">${count} real event${count === 1 ? '' : 's'} exported.</div>`;
    render();
  });

  root.querySelector('#import-btn').addEventListener('click', async () => {
    const msgEl = root.querySelector('#reconcile-msg');
    const file = root.querySelector('#import-file').files?.[0];
    if (!file) { msgEl.innerHTML = `<div class="msg error">Choose a file first.</div>`; return; }
    try {
      const { imported, alreadyPresent, sourceDomain, importedDomains } = await importHistory(state.dag, file);
      for (const d of importedDomains) state.importedDomains.add(d);
      lastMsg = `<div class="msg ok">${imported} event${imported === 1 ? '' : 's'} imported${alreadyPresent > 0 ? `, ${alreadyPresent} already known` : ''}${sourceDomain ? ` from ${short(sourceDomain, 8)}` : ''}.</div>`;
      await rematerialize();
      render();
    } catch (e) {
      msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
    }
  });

  root.querySelectorAll('[data-commit]').forEach((btn) => {
    btn.addEventListener('click', () => doCommitReception(root, btn.dataset.commit, pendingDomains.get(btn.dataset.commit)));
  });

  // Real QR injection happens after the synchronous render, since
  // generating one is async — never blocks the rest of the page from
  // appearing. A real, unexpected failure just leaves the container
  // empty; the always-real text blob right below it still works.
  const offerQrEl = root.querySelector('#p2p-offer-qr');
  if (offerQrEl) generateQrSvg('offer', p2pOfferBlob).then((svg) => { if (svg && root.isConnected) offerQrEl.innerHTML = svg; });
  const answerQrEl = root.querySelector('#p2p-answer-qr');
  if (answerQrEl) generateQrSvg('answer', p2pAnswerBlob).then((svg) => { if (svg && root.isConnected) answerQrEl.innerHTML = svg; });
}

async function doCommitReception(root, sourceDomain, info) {
  const msgEl = root.querySelector('#reconcile-msg');
  try {
    state.mirrorEpoch += 1;
    const commitment = await buildReceptionCommitment(state.keypair, state.domainId, state.mirrorEpoch, sourceDomain, [info.lastEventId]);
    const id = await state.dag.addEvent([state.lastEventId], { type: 'reception', ...commitment });
    state.lastEventId = id;
    await rematerialize();
    lastMsg = `<div class="msg ok">Real, signed reception of ${short(sourceDomain, 8)} committed.</div>`;
    render();
  } catch (e) {
    msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
  }
}
