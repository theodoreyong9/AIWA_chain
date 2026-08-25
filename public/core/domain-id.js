// A domain's id: full SHA-256 of its public key, hex-encoded, never
// truncated (a shortened id would be a real, findable collision target
// once a signature binds to it).

export async function deriveDomainId(publicKeyBytes) {
  const digest = await crypto.subtle.digest('SHA-256', publicKeyBytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Display only — never use as an identifier in a security check.
export function shortLabel(domainId, length = 12) {
  return domainId.slice(0, length);
}
