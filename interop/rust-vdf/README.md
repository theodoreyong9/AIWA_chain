# rust-vdf — a real cross-runtime interoperability demonstration

Not a port of AIWA Chain to Rust — a real, growing, independent
implementation of specific, real pieces of the protocol's own custom
logic: the sequential VDF hash chain (`vdf.js`), domain-id derivation
(`domain-id.js`), event-id canonicalization (`event-dag.js`, §3.1),
generous-transfer's own deterministic outcome (`generous-transfer.js`,
§15), the weighted median (`weighted-median.js`, §13), Conservation's
own split invariant (`conservation.js`, §9, real 18-decimal amounts),
Mirror's own reception monotonicity (`mirror.js`, §4), and
relative-rate's own central ratio (`relative-rate.js`, §14) — each
written directly from the same real specification, never by wrapping
or transpiling the JS. Standard, already-widespread primitives
(Ed25519 signatures, SHA-256 itself) are deliberately left to each
ecosystem's own standard library rather than reimplemented here — the
real, checked risk is silent divergence in this project's *own custom
logic*, not in an already-standardized algorithm.

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
