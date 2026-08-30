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
use num_bigint::BigUint;
use num_bigint::ToBigUint;
use std::str::FromStr;
use ed25519_dalek::{Signature, VerifyingKey, Verifier};

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

// A real, independent implementation of generous-transfer.js's own
// real, deterministic outcome computation (§15) — never randomness,
// exactly like mining: the same real hash function, the same real
// leading-zero-bit count, computed here completely independently.
fn compute_outcome_hash(generous_send_event_id: &str, vdf_output: &str) -> String {
    let combined = format!("{}:{}", generous_send_event_id, vdf_output);
    to_hex(&sha256(combined.as_bytes()))
}

fn count_leading_zero_bits(hex_string: &str) -> u32 {
    let mut bits = 0u32;
    for ch in hex_string.chars() {
        let nibble = ch.to_digit(16).unwrap_or(0);
        if nibble == 0 {
            bits += 4;
            continue;
        }
        bits += nibble.leading_zeros() - 28;
        break;
    }
    bits
}

fn check_outcome(hash_hex: &str, threshold_bits: u32) -> bool {
    count_leading_zero_bits(hash_hex) >= threshold_bits
}

// A real, independent implementation of weighted-median.js's own
// real, custom crossing-point algorithm (§13) — never an average of
// the two middle values, the exact, real property causal-tick.js's
// own security bound (§sum w_i/2) depends on.
fn weighted_median(estimates: &[(f64, f64)]) -> f64 {
    let total_weight: f64 = estimates.iter().map(|(_, w)| w).sum();
    let mut sorted: Vec<(f64, f64)> = estimates.to_vec();
    sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    let mut cumulative = 0.0;
    for (value, weight) in &sorted {
        cumulative += weight;
        if cumulative >= total_weight / 2.0 {
            return *value;
        }
    }
    sorted.last().unwrap().0
}

// A real, independent implementation of conservation.js's own real
// split invariant (§9) — secondAmount computed once, by real integer
// subtraction, never independently re-derived. u128 here plays the
// exact real role JS's own unbounded BigInt does for real, 18-decimal
// AIWA base units — large enough for any real, realistic amount.
fn split_second_amount(total: u128, first_amount: u128) -> u128 {
    total - first_amount
}

// A real, independent implementation of mirror.js's own real
// reception monotonicity check (§4) — a domain's own successive
// claims about what it has observed of a real target can never
// regress. Given already-resolved epoch maps (the real signature
// verification and epoch-lookup machinery around this stays
// JS-side, standard Ed25519, not custom logic prone to silent
// divergence — this isolates and verifies the real, custom part).
fn check_monotonicity(prior_max: &std::collections::HashMap<String, i64>, resolved_epochs: &std::collections::HashMap<String, i64>) -> bool {
    for (source_domain, new_max) in resolved_epochs {
        let previous = *prior_max.get(source_domain).unwrap_or(&0);
        if *new_max < previous {
            return false;
        }
    }
    true
}

// A real, independent implementation of relative-rate.js's own real,
// central ratio (§14) — never a clock, a pure function of two real,
// already-verified epoch deltas. Real IEEE 754 f64 division here
// plays the identical role JS's own Number division does.
fn rate_ratio(observer_earlier: i64, observer_later: i64, target_earlier: i64, target_later: i64) -> f64 {
    let observer_delta = (observer_later - observer_earlier) as f64;
    let target_delta = (target_later - target_earlier) as f64;
    target_delta / observer_delta
}

// A real, independent implementation of causal-tick.js's own real
// consistency check — the one genuinely new, custom piece of logic
// in the full Causal Tick flow beyond weighted_median (already
// verified above) and Math.min/max (trivial).
fn check_causal_consistency(self_reported_epoch: i64, causal_tick: i64, tolerance: i64) -> (bool, i64) {
    let gap = (self_reported_epoch - causal_tick).abs();
    (gap <= tolerance, gap)
}

// A real, independent implementation of wesolowski-vdf.js's own real
// verification (§6.1) — the one, PRACTICAL path a real, external,
// gas-constrained chain would actually use to verify AIWA's own
// sequential work, since redoing the raw, symmetric hash chain
// itself (compute_vdf_chain above) would be prohibitively expensive
// for any real iteration count. Confirming this real algorithm is
// genuinely, faithfully reproducible outside JS is the real,
// concrete confirmation this project's own "native interchain"
// claim (§16.1) needs — not an adapter, but proof the verification
// itself carries no hidden, JS-specific dependency.

const MILLER_RABIN_WITNESSES: [u32; 12] = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];

fn is_probable_prime(n: &BigUint) -> bool {
    let two = 2u32.to_biguint().unwrap();
    if *n < two { return false; }
    for &p in MILLER_RABIN_WITNESSES.iter() {
        let pb = p.to_biguint().unwrap();
        if *n == pb { return true; }
        if n % &pb == BigUint::from(0u32) { return false; }
    }
    let one = BigUint::from(1u32);
    let n_minus_1 = n - &one;
    let mut d = n_minus_1.clone();
    let mut r: u64 = 0;
    while (&d % 2u32) == BigUint::from(0u32) {
        d /= 2u32;
        r += 1;
    }
    'witness: for &a in MILLER_RABIN_WITNESSES.iter() {
        let ab = a.to_biguint().unwrap();
        if ab >= *n { continue; }
        let mut x = ab.modpow(&d, n);
        if x == one || x == n_minus_1 { continue; }
        for _ in 0..(r.saturating_sub(1)) {
            x = (&x * &x) % n;
            if x == n_minus_1 { continue 'witness; }
        }
        return false;
    }
    true
}

// The identical, real algorithm as bigint-math.js's own hashToPrime —
// SHA-256 the real message, truncate to the real bit length, force
// the real top bit and oddness, then increment by 2 until a real,
// independently-verified probable prime is found.
fn hash_to_prime(message: &[u8], bit_length: u32) -> BigUint {
    let digest = sha256(message);
    let full = BigUint::from_bytes_be(&digest);
    let modulus = BigUint::from(1u32) << bit_length;
    let mut candidate = &full % &modulus;
    candidate |= BigUint::from(1u32) << (bit_length - 1);
    candidate |= BigUint::from(1u32);
    while !is_probable_prime(&candidate) {
        candidate += 2u32;
    }
    candidate
}

fn wesolowski_derive_challenge(x: &BigUint, iterations: u64, y: &BigUint) -> BigUint {
    let message = format!("{}|{}|{}", x.to_str_radix(16), iterations, y.to_str_radix(16));
    hash_to_prime(message.as_bytes(), 128)
}

fn wesolowski_verify(x: &BigUint, iterations: u64, y: &BigUint, pi: &BigUint, l: &BigUint, n: &BigUint) -> bool {
    let x_mod = x % n;
    let expected_l = wesolowski_derive_challenge(&x_mod, iterations, y);
    if *l != expected_l { return false; }
    let two_pow_iterations = BigUint::from(2u32).pow(iterations.try_into().unwrap());
    let r = two_pow_iterations % l;
    let check = (pi.modpow(l, n) * x_mod.modpow(&r, n)) % n;
    check == (y % n)
}

// A real, independent Ed25519 verification — a genuinely different
// real library (ed25519-dalek) from what the real JS side uses
// (@noble/curves), confirming the algorithm itself, not one
// particular library's own implementation, is what a real signature
// depends on. The final, real piece needed for §16.1's own "native
// interchain" claim: every real primitive an external verifier would
// need — canonicalization, SHA-256, the practical VDF proof, and now
// signatures — confirmed genuinely portable outside JS.
fn verify_ed25519(pubkey_hex: &str, message: &[u8], signature_hex: &str) -> bool {
    let pubkey_bytes = hex_decode(pubkey_hex);
    let sig_bytes = hex_decode(signature_hex);
    let pubkey_array: [u8; 32] = match pubkey_bytes.try_into() { Ok(a) => a, Err(_) => return false };
    let sig_array: [u8; 64] = match sig_bytes.try_into() { Ok(a) => a, Err(_) => return false };
    let verifying_key = match VerifyingKey::from_bytes(&pubkey_array) { Ok(k) => k, Err(_) => return false };
    let signature = Signature::from_bytes(&sig_array);
    verifying_key.verify(message, &signature).is_ok()
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

    // The identical, real test vectors found and verified against the
    // real JS generous-transfer.js — one real, honest loss, one real win.
    let losing_hash = compute_outcome_hash("commitment-id-abc", "vdf-output-xyz-123");
    let winning_hash = compute_outcome_hash("commitment-id-abc", "vdf-output-90");

    // §13's own real weighted median — two real, non-trivial vectors,
    // exercising both the real sort and the real crossing point.
    let median1 = weighted_median(&[(100.0, 30.0), (50.0, 45.0), (200.0, 10.0), (75.0, 15.0)]);
    let median2 = weighted_median(&[(1000.0, 5.0), (2000.0, 5.0), (3000.0, 90.0)]);

    // §9's own real split invariant — a real, large, 18-decimal AIWA
    // amount, the exact scale real usage would produce.
    let total: u128 = 1000123456789012345678u128;
    let first_amount: u128 = 333333333333333333333u128;
    let second_amount = split_second_amount(total, first_amount);

    // §4's own real reception monotonicity — a real, accepted case
    // and a real, rejected regression, the identical, real vectors
    // tests/rust-interop.test.mjs computes against.
    let mut prior_max1 = std::collections::HashMap::new();
    prior_max1.insert("mars".to_string(), 50i64);
    prior_max1.insert("jupiter".to_string(), 10i64);
    let mut claim1 = std::collections::HashMap::new();
    claim1.insert("mars".to_string(), 55i64);
    claim1.insert("jupiter".to_string(), 10i64);
    let monotonicity_case1 = check_monotonicity(&prior_max1, &claim1);

    let mut claim2 = std::collections::HashMap::new();
    claim2.insert("mars".to_string(), 40i64);
    claim2.insert("jupiter".to_string(), 15i64);
    let monotonicity_case2 = check_monotonicity(&prior_max1, &claim2);

    // §14's own real ratio — a real, non-integer result, the
    // identical, real central computation this whole mechanism
    // depends on.
    let ratio = rate_ratio(10, 133, 100, 481);

    // §13's own real consistency check — a real consistent case and
    // a real inconsistent one.
    let (consistent_case, consistent_gap) = check_causal_consistency(100, 95, 10);
    let (inconsistent_case, inconsistent_gap) = check_causal_consistency(100, 50, 10);

    // §6.1's own real, practical Wesolowski verification — the exact,
    // real test vector computed against the real JS wesolowski-vdf.js.
    let n = BigUint::from_str("25195908475657893494027183240048398571429282126204032027777137836043662020707595556264018525880784406918290641249515082189298559149176184502808489120072844992687392807287776735971418347270261896375014971824691165077613379859095700097330459748808428401797429100642458691817195118746121515172654632282216869987549182422433637259085141865462043576798423387184774447920739934236584823824281198163815010674810451660377306056201619676256133844143603833904414952634432190114657544454178424020924616515723350778707749817125772467962926386356373289912154831438167899885040445364023527381951378636564391212010397122822120720357").unwrap();
    let x = BigUint::from(123456789u64);
    let iterations: u64 = 50;
    let y = BigUint::from_str("3161893899260805310284392816158537373952512647284070305980548775938627392891415464608625498982983630215026142608025718280389454768322722965460488131364529090575377142071895729330181087045518069540919695205503777161478847916206305567896181780170343172879285262425236182351042400584756314553197231663442599881439728969255616953580843361841121998801559196021240673913133945631093408316714054524438953684497771377986230060103375191803287491351528719107207019478942040796426763826332791945433786462728578293110716165434385804189597652775227036080462014627256467979156472075983416859151733787214193700880662976726806260452").unwrap();
    let real_pi = BigUint::from(1u32);
    let real_l = BigUint::from_str("182976577130776636739865532488529097497").unwrap();
    let wesolowski_valid = wesolowski_verify(&x, iterations, &y, &real_pi, &real_l, &n);
    let wesolowski_invalid_y = &y + BigUint::from(1u32);
    let wesolowski_invalid = wesolowski_verify(&x, iterations, &wesolowski_invalid_y, &real_pi, &real_l, &n);

    // The identical, real test vector generated by the real JS side
    // (@noble/curves) — verified here by a completely different real
    // library (ed25519-dalek).
    let ed_pubkey = "bd625af599e22fdfd30a9b76600abe5beb36571854d0532cda94f67724069485";
    let ed_message = b"{\"contractId\":\"aiwa-generous-transfer-v1\",\"to\":\"bob\"}";
    let ed_signature = "23b5759273caddaf0f4d7e40912061f1e0f2c163c19181a76d30187721e6f198bebbe1c4ee0558b477ea26fd516eafdc521876c5d61efe8d17502cb1035c8e06";
    let ed25519_valid = verify_ed25519(ed_pubkey, ed_message, ed_signature);
    let tampered_message = b"{\"contractId\":\"aiwa-generous-transfer-v1\",\"to\":\"mallory\"}";
    let ed25519_invalid = verify_ed25519(ed_pubkey, tampered_message, ed_signature);

    println!(
        "{{\"vdf1\":\"{}\",\"vdf2\":\"{}\",\"vdf3\":\"{}\",\"domainId\":\"{}\",\"genesisId\":\"{}\",\"accrualId\":\"{}\",\"composedId\":\"{}\",\"losingHash\":\"{}\",\"losingCheck4\":{},\"winningHash\":\"{}\",\"winningCheck8\":{},\"median1\":{},\"median2\":{},\"secondAmount\":\"{}\",\"monotonicityCase1\":{},\"monotonicityCase2\":{},\"ratio\":{},\"consistentCase\":{},\"consistentGap\":{},\"inconsistentCase\":{},\"inconsistentGap\":{},\"wesolowskiValid\":{},\"wesolowskiInvalid\":{},\"ed25519Valid\":{},\"ed25519Invalid\":{}}}",
        vdf1, vdf2, vdf3, domain_id, genesis_id, accrual_id, composed_id,
        losing_hash, check_outcome(&losing_hash, 4),
        winning_hash, check_outcome(&winning_hash, 8),
        median1, median2,
        second_amount,
        monotonicity_case1, monotonicity_case2,
        ratio,
        consistent_case, consistent_gap, inconsistent_case, inconsistent_gap,
        wesolowski_valid, wesolowski_invalid,
        ed25519_valid, ed25519_invalid
    );
}
