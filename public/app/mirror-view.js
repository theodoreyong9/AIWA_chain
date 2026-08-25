import { state, short } from './state.js';
import { render, rematerialize } from './app.js';
import { exportHistory, importHistory, buildReceptionCommitment } from './reconciliation.js';
import { computeResidualDiversity } from '../core/mirror.js';

let lastMsg = null;

function observedDomains() {
  const seen = new Map(); // domain -> { lastEventId, eventCount }
  for (const event of state.dag.topoOrder()) {
    const d = event.payload?.domain;
    if (!d || d === state.domainId) continue;
    if (event.payload?.type !== 'progression') continue;
    const entry = seen.get(d) ?? { lastEventId: null, eventCount: 0 };
    entry.lastEventId = event.id;
    entry.eventCount += 1;
    seen.set(d, entry);
  }
  return seen;
}

// A real, deterministic angle from a stable hash of the domain id —
// spreads observed domains around visually; carries no meaning of its
// own beyond avoiding overlap. Distance from center is the one real,
// computed value: how much this domain actually knows about them,
// via real corroboration weight from causal-tick.js — never fake
// geography, exactly the point.
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
    return `<div class="empty-state" style="padding:30px 10px"><div class="glyph">\u25CB</div>No domains observed yet \u2014 import a real history file to populate this.</div>`;
  }
  const maxCount = Math.max(...[...domains.values()].map((d) => d.eventCount));
  const nodes = [...domains.entries()].map(([domainId, info]) => {
    const angle = angleFor(domainId);
    // More real, known events from this domain -> closer (smaller radius).
    // A domain barely known sits near the edge.
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

export function renderMirror(root) {
  if (!state.domainId) {
    root.innerHTML = `
      <div class="top-bar"><div class="wordmark">AIWA <em>chain</em></div></div>
      <div class="empty-state"><div class="glyph">\u25CB</div>No identity yet \u2014 create one in Continuum first.</div>
    `;
    return;
  }

  const domains = observedDomains();

  root.innerHTML = `
    <div class="top-bar">
      <div class="wordmark">AIWA <em>chain</em></div>
      <div class="address-chip" id="addr-copy" title="Click to copy">${short(state.domainId, 10)}</div>
    </div>
    <div class="tabs">
      <div class="tab" data-tab="continuum">Continuum</div>
      <div class="tab active" data-tab="mirror">Mirror</div>
      <div class="tab" data-tab="ignition">Ignition</div>
    </div>

    <div class="card">
      <div class="card-title">Entropic space</div>
      <p class="hint">Not geography \u2014 distance here is how little this domain actually knows about another, computed from real, imported history. Never a claim about where anything physically is.</p>
      ${(() => {
        const diversity = computeResidualDiversity(state.mirror, state.domainId);
        return diversity.distinctSources > 0
          ? `<div class="row"><span class="row-label">Your own residual diversity</span><span class="row-value">H=${diversity.entropy.toFixed(2)} across ${diversity.distinctSources} source${diversity.distinctSources === 1 ? '' : 's'}</span></div>`
          : '';
      })()}
      ${entropicSpaceSvg(domains)}
    </div>

    <div class="card">
      <div class="card-title">Reconciliation</div>
      <p class="hint">The one real channel this app has for another domain's history to ever reach yours \u2014 no live peer-to-peer transport exists in this scope. Carried by hand, like a physically transported drive.</p>
      <div class="btn-row"><button id="export-btn">Export your history</button></div>
      <label class="field-label" style="margin-top:14px">Import a real history file</label>
      <input type="file" id="import-file" accept="application/json" />
      <div class="btn-row"><button id="import-btn">Import</button></div>
      <div id="reconcile-msg">${lastMsg ?? ''}</div>
    </div>

    <div class="card">
      <div class="card-title">Observed domains (${domains.size})</div>
      ${domains.size === 0 ? '<div class="hint">None yet.</div>' : [...domains.entries()].map(([d, info]) => `
        <div class="list-row">
          <div style="flex:1"><div class="mono-id">${short(d, 16)}</div><div class="hint">${info.eventCount} real event${info.eventCount === 1 ? '' : 's'} known</div></div>
          <button data-commit="${d}">Commit reception</button>
        </div>
      `).join('')}
    </div>
  `;

  root.querySelectorAll('.tab').forEach((el) => el.addEventListener('click', () => { state.activeTab = el.dataset.tab; render(); }));
  root.querySelector('#addr-copy').addEventListener('click', () => navigator.clipboard?.writeText(state.domainId));

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
      const { imported, alreadyPresent, sourceDomain } = await importHistory(state.dag, file);
      lastMsg = `<div class="msg ok">${imported} event${imported === 1 ? '' : 's'} imported${alreadyPresent > 0 ? `, ${alreadyPresent} already known` : ''}${sourceDomain ? ` from ${short(sourceDomain, 8)}` : ''}.</div>`;
      await rematerialize();
      render();
    } catch (e) {
      msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
    }
  });

  root.querySelectorAll('[data-commit]').forEach((btn) => {
    btn.addEventListener('click', () => doCommitReception(root, btn.dataset.commit, domains.get(btn.dataset.commit)));
  });
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
