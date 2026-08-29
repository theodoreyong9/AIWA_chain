// A real, independent Rust implementation of vdf.js's own
// computeVdfChain and domain-id.js's own deriveDomainId — written
// from the same real specification (SHA-256, chained, hex-encoded),
// never by importing, wrapping, or transpiling the JS. This exists to
// demonstrate a real, verified claim: the protocol's own canonical
// core (a real sequential hash chain, real content-addressed ids) is
// specified precisely enough to be reproduced byte-for-byte in a
// genuinely different language and runtime — not merely asserted to
// be "interoperable in principle".
//
// tests/rust-interop.test.mjs builds and runs this binary, then
// compares its real output against the real JS module's own output
// for the identical test vectors, failing loudly on any mismatch.
// This is a real, ongoing, re-runnable check, not a one-time claim.

use serde_json::Value;
use sha2::{Digest, Sha256};

fn sha256(bytes: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().to_vec()
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn vdf_seed(domain: &str, previous_output: &str) -> String {
    format!("{}:{}", domain, previous_output)
}

fn compute_vdf_chain(seed: &str, iterations: u32) -> String {
    let mut h = sha256(seed.as_bytes());
    for _ in 1..iterations {
        h = sha256(&h);
    }
    to_hex(&h)
}

fn hex_decode(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

fn derive_domain_id_from_hex_pubkey(pubkey_hex: &str) -> String {
    to_hex(&sha256(&hex_decode(pubkey_hex)))
}

// A real, independent implementation of event-dag.js's own real
// canonicalize() + computeId() — §3.1 of the Yellow Paper. Built
// manually, string by string, rather than trusting a JSON library's
// own default map-serialization order, since THAT order is exactly
// the real, easy-to-get-subtly-wrong thing this function exists to
// pin down precisely.
fn canonical_json(v: &Value) -> String {
    match v {
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().map(canonical_json).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .iter()
                .map(|k| format!("{}:{}", serde_json::to_string(k).unwrap(), canonical_json(&map[*k])))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        _ => serde_json::to_string(v).unwrap(),
    }
}

fn compute_event_id(parents: &mut Vec<String>, payload: &Value) -> String {
    parents.sort();
    let wrapped = serde_json::json!({ "parents": parents, "payload": payload });
    let canonical = canonical_json(&wrapped);
    to_hex(&sha256(canonical.as_bytes()))
}

fn main() {
    // Real, fixed test vectors — the identical ones
    // tests/rust-interop.test.mjs computes against via the real JS
    // module, so the two real, independent outputs can be compared
    // byte-for-byte.
    let vdf1 = compute_vdf_chain(&vdf_seed("earth-domain", "genesis"), 500);
    let vdf2 = compute_vdf_chain(&vdf_seed("mars-domain", &vdf1), 500);
    let vdf3 = compute_vdf_chain(&vdf_seed("earth-domain", "genesis"), 12000);
    let domain_id = derive_domain_id_from_hex_pubkey(&"07".repeat(32));

    // The identical real, non-trivial event structure (nested payload,
    // multiple parents given out of order) as tests/rust-interop.test.mjs
    // computes via the real JS event-dag.js, so the two real ids can be
    // compared byte-for-byte.
    let mut p1 = Vec::<String>::new();
    let genesis_id = compute_event_id(&mut p1, &serde_json::json!({ "type": "genesis" }));

    let mut p2 = Vec::<String>::new();
    let accrual_id = compute_event_id(&mut p2, &serde_json::json!({ "type": "accrual", "domain": "z-domain", "b": 10 }));

    let mut composed_parents = vec![accrual_id.clone(), genesis_id.clone()]; // deliberately out of order
    let composed_payload = serde_json::json!({
        "type": "reception",
        "domain": "test-domain",
        "epoch": 3,
        "receivedFrom": [{ "sourceDomain": "c", "eventId": "e1" }, { "sourceDomain": "a", "eventId": "e2" }],
        "kind": "full",
    });
    let composed_id = compute_event_id(&mut composed_parents, &composed_payload);

    println!(
        "{{\"vdf1\":\"{}\",\"vdf2\":\"{}\",\"vdf3\":\"{}\",\"domainId\":\"{}\",\"genesisId\":\"{}\",\"accrualId\":\"{}\",\"composedId\":\"{}\"}}",
        vdf1, vdf2, vdf3, domain_id, genesis_id, accrual_id, composed_id
    );
}
