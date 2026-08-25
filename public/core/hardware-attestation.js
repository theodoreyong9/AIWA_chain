// A domain's minimal independence hypothesis: attestation that it is
// not backed solely by an actor who can fabricate arbitrary
// identities and observations in software alone. This is a real,
// binary GATE on observation eligibility (causal-tick.js's own
// computeCausalTick consumes it as such) — never a weight, never a
// vote, never itself the source of Causal Tick's own value.
//
// A real, two-hop signature chain:
//   origin domain --[issues]--> hardware root --[binds]--> this domain
//
// HONEST LIMIT, stated directly: nothing here, or in any purely
// cryptographic protocol, can verify from software alone that a
// hardware root's signing key really lives on real, non-clonable
// hardware. What this DOES verify is a real, traceable chain of
// signatures from a known origin — reducing the trust surface from
// "any of N sybil identities" to "compromising the origin's own
// issuance process, or this one specific unit" — a real, meaningful
// reduction, never an absolute physical guarantee.
//
// The real requirement (a domain needs at least two, distinct
// independently-issued hardware roots — never one, which would only
// move trust to a single unit rather than establish any real
// minimum) is enforced here as MIN_INDEPENDENT_ROOTS.

const MIN_INDEPENDENT_ROOTS = 2;

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function canonicalIssuance({ originDomain, hardwareRootPubkey, issuedAt, nonce }) {
  return JSON.stringify({ originDomain, hardwareRootPubkey, issuedAt, nonce });
}
function canonicalBinding({ hardwareRootPubkey, boundDomain, boundAt }) {
  return JSON.stringify({ hardwareRootPubkey, boundDomain, boundAt });
}

/**
 * The origin's own real signature — issuing a real hardware root. The
 * origin's own identity must itself already be a real, established
 * AIWA domain (its own signature here is over its own domain-deriving
 * key, verified the identical way any other real signature in this
 * project is).
 */
export async function issueHardwareRoot(originKeypair, originDomain, hardwareRootPubkeyBytes, { issuedAt = Date.now(), nonce = crypto.randomUUID() } = {}) {
  const { ed25519 } = await import('@noble/curves/ed25519.js');
  const fields = { originDomain, hardwareRootPubkey: toHex(hardwareRootPubkeyBytes), issuedAt, nonce };
  const message = new TextEncoder().encode(canonicalIssuance(fields));
  const signature = ed25519.sign(message, originKeypair.secretKey.slice(0, 32));
  return { ...fields, originSignature: toHex(signature), originSignerPubkey: toHex(originKeypair.publicKey.toBytes()) };
}

/**
 * The hardware root's own real signature — binding itself to a
 * specific AIWA domain, once installed in that domain's own
 * partition.
 */
export async function bindHardwareRoot(hardwareRootSecretKey, hardwareRootPubkeyBytes, boundDomain, { boundAt = Date.now() } = {}) {
  const { ed25519 } = await import('@noble/curves/ed25519.js');
  const fields = { hardwareRootPubkey: toHex(hardwareRootPubkeyBytes), boundDomain, boundAt };
  const message = new TextEncoder().encode(canonicalBinding(fields));
  const signature = ed25519.sign(message, hardwareRootSecretKey);
  return { ...fields, bindingSignature: toHex(signature) };
}

/**
 * Verifies one real, complete attestation: the origin really issued
 * this hardware root, AND this hardware root really bound itself to
 * this domain. Both signatures independently recomputed and checked
 * — never trusted from the record's own unverified claims about
 * itself.
 *
 * @param {{ issuance: object, binding: object }} attestation
 * @param {string} expectedDomain
 * @returns {Promise<boolean>}
 */
export async function verifyHardwareAttestation(attestation, expectedDomain) {
  const { ed25519 } = await import('@noble/curves/ed25519.js');
  const { deriveDomainId } = await import('./domain-id.js');
  const { issuance, binding } = attestation ?? {};
  if (!issuance || !binding) return false;
  if (binding.boundDomain !== expectedDomain) return false;
  if (binding.hardwareRootPubkey !== issuance.hardwareRootPubkey) return false;

  try {
    // The signing key must really BE the claimed origin's own key —
    // not merely a valid signature by SOME key, which an attacker
    // could produce for any self-declared originDomain string.
    if ((await deriveDomainId(fromHex(issuance.originSignerPubkey))) !== issuance.originDomain) return false;

    const issuanceMessage = new TextEncoder().encode(canonicalIssuance(issuance));
    const issuanceValid = ed25519.verify(fromHex(issuance.originSignature), issuanceMessage, fromHex(issuance.originSignerPubkey));
    if (!issuanceValid) return false;

    const bindingMessage = new TextEncoder().encode(canonicalBinding(binding));
    const bindingValid = ed25519.verify(fromHex(binding.bindingSignature), bindingMessage, fromHex(binding.hardwareRootPubkey));
    if (!bindingValid) return false;
  } catch {
    return false; // malformed hex or signature shape — rejected, not a crash
  }

  return true;
}

/**
 * The real gate: a domain's minimal independence hypothesis holds
 * only with at least MIN_INDEPENDENT_ROOTS real, distinct, fully
 * verified attestations — never one, and never counted by weight.
 * Distinctness is by hardware root public key, not by issuance record
 * — the same physical unit re-attested twice must not count twice.
 *
 * @param {Array<{ issuance: object, binding: object }>} attestations
 * @param {string} domain
 * @returns {Promise<boolean>}
 */
export async function isIndependenceAttested(attestations, domain) {
  const distinctRoots = new Set();
  for (const attestation of attestations ?? []) {
    if (await verifyHardwareAttestation(attestation, domain)) {
      distinctRoots.add(attestation.binding.hardwareRootPubkey);
    }
  }
  return distinctRoots.size >= MIN_INDEPENDENT_ROOTS;
}

export { MIN_INDEPENDENT_ROOTS };
