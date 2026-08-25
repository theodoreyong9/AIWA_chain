import { ed25519 } from '@noble/curves/ed25519.js';
import { deriveDomainId } from '../core/domain-id.js';

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A real export of everything this local DAG holds — the only real
// channel this single-tab app has for one domain's history to ever
// reach another, since no real peer-to-peer transport exists in this
// scope. Carried by hand, exactly like a physically-transported drive
// would be for a genuinely disconnected domain.
export function exportHistory(dag, domainId) {
  const events = dag.topoOrder();
  const blob = new Blob([JSON.stringify({ format: 'aiwa-chain-export-v1', exportedAt: Date.now(), fromDomain: domainId, events }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aiwa-chain-${domainId ? domainId.slice(0, 10) : 'export'}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return events.length;
}

// Merges a real exported file's events into this local DAG — ids are
// recomputed by addEvent() itself, never trusted from the file. This
// is what makes real, distinct-domain Mirror observation possible at
// all in a single-tab app: without another domain's real progression
// events actually present locally, there is nothing real to observe
// or sign a commitment about.
export async function importHistory(dag, file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed.format !== 'aiwa-chain-export-v1' || !Array.isArray(parsed.events)) {
    throw new Error('Not a recognized aiwa-chain export file.');
  }
  const before = dag.topoOrder().length;
  // Real topological replay — parents before children — using the
  // DAG's own real ids, not the file's claimed order.
  const byId = new Map(parsed.events.map((e) => [e.id, e]));
  const visited = new Set();
  const ordered = [];
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const ev = byId.get(id);
    if (!ev) return;
    for (const p of ev.parents) visit(p);
    ordered.push(ev);
  }
  for (const ev of parsed.events) visit(ev.id);
  for (const ev of ordered) {
    try { await dag.addEvent(ev.parents, ev.payload); } catch { /* an event whose parent this DAG never received — skipped, not crashed on */ }
  }
  const after = dag.topoOrder().length;
  return { imported: after - before, alreadyPresent: ordered.length - (after - before), sourceDomain: parsed.fromDomain ?? null };
}

function canonicalReceptionMessage({ domain, epoch, kind, receivedFrom }) {
  const sorted = [...receivedFrom].sort((a, b) => (a.sourceDomain + a.eventId).localeCompare(b.sourceDomain + b.eventId));
  return JSON.stringify({ domain, epoch, kind, receivedFrom: sorted });
}

// A real, signed reception commitment — this domain really attesting
// to what it has really observed of `sourceDomain`'s own progression,
// after really importing it. epoch is this domain's own current
// commitment sequence number, never the observed domain's.
export async function buildReceptionCommitment(keypair, domain, epoch, sourceDomain, sourceEventIds) {
  const receivedFrom = sourceEventIds.map((eventId) => ({ sourceDomain, eventId }));
  const fields = { domain, epoch, kind: 'full', receivedFrom };
  const message = new TextEncoder().encode(canonicalReceptionMessage(fields));
  const signature = ed25519.sign(message, keypair.secretKey.slice(0, 32));
  return { ...fields, signature: toHex(signature), signerPubkey: toHex(keypair.publicKey.toBytes()) };
}
