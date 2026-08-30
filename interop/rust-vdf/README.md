# rust-vdf — a real cross-runtime interoperability demonstration

Not a port of AIWA Chain to Rust — a real, growing, independent
implementation of specific, real pieces of the protocol's own custom
logic: the sequential VDF hash chain (`vdf.js`), domain-id derivation
(`domain-id.js`), event-id canonicalization (`event-dag.js`, §3.1),
generous-transfer's own deterministic outcome (`generous-transfer.js`,
§15), the weighted median (`weighted-median.js`, §13), Conservation's
own split invariant (`conservation.js`, §9, real 18-decimal amounts),
Mirror's own reception monotonicity (`mirror.js`, §4),
relative-rate's own central ratio (`relative-rate.js`, §14),
Causal Tick's own consistency check (`causal-tick.js`, §13), the
real, *practical* Wesolowski verification (`wesolowski-vdf.js`,
§6.1) — including real prime-derivation and Miller-Rabin primality
testing, the one path an external, gas-constrained chain would
genuinely use, never the raw symmetric chain — and Ed25519 signature
verification, checked against a real, independent Rust library
(`ed25519-dalek`) rather than the real JS one this project uses
(`@noble/curves`), confirming the algorithm itself, not one
implementation, is what a real signature depends on — each
written directly from the same real specification, never by wrapping
or transpiling the JS. Standard, already-widespread primitives
(Ed25519 signatures, SHA-256 itself) are deliberately left to each
ecosystem's own standard library rather than reimplemented here — the
real, checked risk is silent divergence in this project's *own custom
logic*, not in an already-standardized algorithm.

Considered and deliberately not extended further: `matching-contract.js`
and `registerVerifiedContract` are real orchestration over primitives
already covered above (Ed25519 checks, `resolveGenerousSend`'s own
already-verified outcome logic, SHA-256 hashing), not new
computation of their own — reimplementing them here would mostly
re-verify what's already independently checked.

`tests/rust-interop.test.mjs` builds this, runs it, and compares its
real output against the real JS module's own output for the identical
test vectors — byte for byte. That test is the actual proof; this
directory is what it verifies.

## Running it yourself

```
cargo build --release
./target/release/vdf-interop
```

Prints a real JSON object with four real hash outputs. Compare them
against `computeVdfChain`/`deriveDomainId` in `public/core/vdf.js` and
`public/core/domain-id.js` for the same inputs (see
`tests/rust-interop.test.mjs` for the exact vectors) — they match
exactly.

## What this does and does not claim

**Does**: prove that this protocol's own most fundamental, real
computation — a real, sequential SHA-256 chain, and real
content-addressed identity — is specified precisely enough to
reproduce byte-for-byte in a genuinely different language and runtime.
This is what makes the claim "the transport, the runtime, the
implementation never enter into the value" a real, checked property
rather than an assertion.

**Does not**: claim this is a full or even partial Rust port of
AIWA Chain. The accrual formula, conservation, Mirror, Causal Tick,
and every other real piece of the protocol exist only in
`public/core/` (JavaScript). A genuine multi-runtime implementation of
the whole protocol would be a real, separate, substantial undertaking
— this demonstrates the one, specific claim that undertaking would
depend on being true, not the whole thing.

## A real, practical note on toolchain versions

Some real dependencies here (`ed25519-dalek`, and transitively
`zeroize`/`base64ct`) require a genuinely recent Rust edition
(2024) that older `rustc` versions don't support. `Cargo.toml` pins
`ed25519-dalek = "2"` with `zeroize = "=1.7.0"` and
`base64ct = "=1.6.0"`, and `Cargo.lock` pins `ed25519-dalek` itself to
`2.1.1` — real, known-compatible versions with `rustc` 1.75.0 and
later. If building with a genuinely newer toolchain, these pins can
likely be relaxed; kept conservative here for real, broad
reproducibility rather than assuming everyone's local `rustc` is
current.
