// A real, general mechanism — not specific to any one contract — for
// publishing a contract's own real identity as an ordinary event in
// the same DAG everything else already lives in. No new
// infrastructure: the real content-addressing already used for every
// other event (event-dag.js's own computeId) is the entire
// mechanism. Once published and received by other domains (via
// Mirror, like any other real event), a contract's own id is
// immutable in the identical, real sense every other event already
// is — not because of any new guarantee, but because this is simply
// what publishing an event has always meant here.
//
// This deliberately does not create a single, network-enforced
// "canonical registry." Multiple, real, competing contracts can
// coexist under different names, each with its own real, verifiable
// identity — wallets and users choose which to trust, exactly like
// there is no single "true" token contract on any existing chain.

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The real, content-derived hash of a contract's own real source. */
export async function computeContractHash(sourceCode) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceCode));
  return toHex(new Uint8Array(digest));
}

/**
 * Publishes a real `contract-spec` event to `dag` — the contract's
 * own real event id (event-dag.js's own content addressing) becomes
 * its real, immutable identity from this point on. `sourceCode` is
 * embedded in full — never only its hash — so the real code is
 * genuinely recoverable from the DAG itself by anyone who receives
 * this event, not merely fingerprint-verifiable against a copy kept
 * elsewhere. `sourceHash` is included alongside for quick, cheap
 * comparison without re-hashing the full body every time.
 *
 * @returns {{ specEventId: string, sourceHash: string }}
 */
export async function publishContractSpec(dag, { name, version, sourceCode, description }) {
  const sourceHash = await computeContractHash(sourceCode);
  const specEventId = await dag.addEvent([], { type: 'contract-spec', name, version, sourceCode, sourceHash, description });
  return { specEventId, sourceHash };
}

/**
 * The real, actual source code, recovered directly from an
 * already-received real event — never assumed to live anywhere else.
 */
export function readContractSource(specEvent) {
  if (!specEvent || specEvent.payload?.type !== 'contract-spec') return null;
  return specEvent.payload.sourceCode ?? null;
}

/**
 * @returns {boolean} true only if `sourceCode`'s own real hash
 * genuinely matches what a real, already-published contract-spec
 * event claims — never trusted from a name or version number alone.
 */
export async function verifyContractSource(specEvent, sourceCode) {
  if (!specEvent || specEvent.payload?.type !== 'contract-spec') return false;
  const realHash = await computeContractHash(sourceCode);
  return realHash === specEvent.payload.sourceHash;
}

/** Every real contract-spec event found in `events` — pure, no browser dependency. */
export function scanContractSpecs(events) {
  return events.filter((ev) => ev.payload?.type === 'contract-spec').map((ev) => ({ id: ev.id, ...ev.payload }));
}
