# AIWA Chain

Two wallets, one identity. A Solana keypair activates a real, irreversible burn (Ignition) — the one real step that needs genuine internet access to Earth's own Solana network. The same key then accrues native AIWA locally, continuously, based on progression since your last action — never a shared clock, never any further network access, ever again.

Live: https://theodoreyong9.github.io/AIWA_chain/

This document tells AIWA's story as a chain of causes and consequences — each mechanism exists because the one before it created a new problem. For the formal specification, see `docs/YELLOWPAPER.md`. For exactly what's verified and how, see `interop/rust-vdf/README.md`.

## 1. The problem this starts from

AIWA takes one assumption seriously: **the world is partitioned.** Two domains can be separated for any length of time — a planet cut off from another, a network split, two communities that simply never share continuous state. The usual distributed-systems question is *"how do we make several participants converge on one shared state despite partitions?"* AIWA asks a different one: *why should two independent histories have to converge on an old shared state at all, just to stay economically and causally coherent?*

So AIWA takes discontinuity as the primitive, not the failure mode. A domain has its own progression, its own history, its own observations. There is no global chain imposing one order, no global clock, no constantly-synchronized world state, no mandatory rollback to a last common point. Each domain advances on its own. When it meets another history, it never has to erase its own to adopt the other's — it only needs a way to record the causal relationship the meeting created.

## 2. Progressing alone: the VDF

If a domain must keep working through a partition, "how much progress has it made" can't be answered by asking the network what time it is. AIWA grounds economic progression in verifiable sequential computation instead of a shared clock.

`vdf.js` is a plain hash chain: `h_0 = SHA-256(seed)`, then `h_i = SHA-256(h_{i-1})`, repeated for a fixed iteration count. Each step depends on the one before it — there's no shortcut, no matter how much parallel hardware is thrown at it. This doesn't measure physical time; it measures verifiable computational progress. AIWA never says "you waited ten minutes." It says "your domain produced the sequential work this step of its own history requires." `progression.js` is what actually enforces this on every epoch transition: monotonic (+1, never a skip), causally chained to the domain's own last accepted transition, and only accepted once the VDF chain re-verifies. Earth and Mars can now progress independently — neither needs to ask the other how far along it is to keep going.

## 3. Progression becomes a causal history: the Event DAG

Progressing isn't enough on its own — a domain also needs to know what produced what. `event-dag.js` represents everything as a grow-only, content-addressed set of events linked by causal parents, never a single insertion order. An event's id is the SHA-256 of its own canonical form (parents sorted, nested objects canonicalized recursively, then hashed) — so two independent implementations, given the identical logical event, always compute the identical id. That's what makes the protocol depend on a canonical representation rather than on how any one language happens to lay an object out in memory.

This is also what lets divergence survive a meeting instead of being erased by it. If `A → A1 → A2` and, separately, `B → B1 → B2` both progress without knowing about each other, AIWA never forces `A2 = B2`. When they meet, a new event can appear — `A2 → C ← B2` — and `C` isn't a correction of either side. It's the new thing their meeting produced.

## 4. Value has to follow that same causality: accrual

Once a domain can prove it progressed, that progression needs to translate into value the domain actually controls. `accrual.js` tracks a position per domain — committed capital `b`, and the epoch of its own last economic action. Two quantities matter here, and the code keeps them deliberately separate:

- **`t`** — progression since this domain's *own last action* (a burn or a claim). Resets every time.
- **`A`** — the domain's *own total age*. Never resets.

Neither is ever taken from an event's own payload — both are recomputed from the domain's already-verified progression state, every time. That's the concrete fix behind a real, closed bug: a caller-supplied reference epoch would have let a domain fabricate an early starting point for its own patience clock.

## 5. The reward formula

$$r(b, q, q_{total}, T) = \frac{b \cdot q^\alpha}{\left[\ln\left(q_{total}^{\beta(1-T)} + C\right)\right]^\gamma}$$

where `b` is a linear scale factor, `q` is progression accumulated since the last claim, `q_total` is the domain's own total progression (never a value shared across domains — that would reintroduce exactly the cross-domain synchronization this whole system exists to avoid), `T` is a patience parameter clamped to `[0, 0.4]`, `α`/`β`/`γ` are shape parameters, and `C` is a damping constant. Three guards are explicit in the code, never implicit: `q < minQ` returns zero outright (no artificial micro-reward); `effQ = max(1, q)` and `effQTotal = max(1, qTotal)` avoid pathological behavior at zero; and a reward exceeding `1e12` returns zero as a hard ceiling against any parameter combination producing a numeric explosion.

**`T` is real in the formula and in `accrual.js`'s own state (a position can carry a `T`), but not yet reachable from the shipped app.** `public/app/ignition.js` is the only place a real `'accrual'` event is ever built, and it never sets a `T` field — every real position's `T` falls through to `0`. The `(1-T)` softening term is unit-tested directly against `reward()`/`rewardFixed()`, and the state machine will carry a non-zero `T` if an event supplies one, but nothing in the current UI, or in any accrual/wallet integration test, ever does. Patience is a designed, working property of the formula — not yet a property a real domain can actually exercise.

## 6. Why accrual alone isn't a defense — genesis cost and churn

This is the point that's easy to get wrong: a reward curve, taken alone, can make restarting from zero *more* profitable than staying — `churn-analysis.js` measures this concretely rather than assuming it away, and with `q` favoring young domains, it genuinely can. So AIWA never asks accrual to carry that defense by itself. `identity-cost.js` is a real, irrecoverable SOL burn to Solana's incinerator address — a burn, not a bond, so its protection never depends on a later slashing step ever propagating through a partition. `churn-analysis.js` then answers a concrete, parameter-specific question: for *these* reward and cost-curve parameters, does repeatedly abandoning a domain for a fresh one net less than staying? With zero real identity cost, churn is measurably profitable; a properly-dimensioned cost curve turns that same net positive into a measured negative. It's the combination of the two mechanisms that closes the gap — neither one does it alone, and `churn-analysis.js` is a calculator to run against your own deployment's numbers, never a universal proof.

## 7. Conservation: value moves without ever drifting

Once value exists, it has to move without arithmetic quietly creating or destroying any of it. AIWA represents amounts as real, 18-decimal bigints (`units.js`) — never a float balance. `conservation.js` goes further than a simple split invariant: a claim's real lifecycle is Deactivate → Prove → Verify → Consume → Activate, with a "transmutation" (an authorized derivation function, transfer being the identity derivation) able to change *kind* without ever touching the ledger invariant, and an idempotent consumed-proof set enforcing `count(Consume(p)) ≤ 1` — the actual real double-spend defense, not merely a rounding guarantee. `wallet.js` composes this with accrual: a `claim` event debits the accrued balance and creates the matching spendable claim in the same pass, checked before either half applies, so the two can never drift apart.

## 8. Meeting another history: the Mirror

We now have local histories that produce exact, transferable value. The still-open question is what happens when two of them meet. `mirror.js` answers with reception commitments, not synchronization: a domain signs, at every one of its own progression epochs, a statement of what it has (or has not) received from others. It never claims to know the world's absolute state — only what its own history has actually observed. **AIWA doesn't force histories to converge; it lets their observations correlate.**

Two properties matter here, and neither is a bigger claim than it looks: **reception monotonicity** means a domain's claim about what it has seen from a given source can never regress — `newEpoch ≥ previousEpoch`, checked and rejected otherwise — which stops a later commitment from silently rewriting an earlier one. It does *not* prove two domains are genuinely distinct entities, and it can't rule out a pair that's simply agreed in advance to fabricate a consistent-looking history together — no purely relational mechanism can, with no external anchor.

## 9. From many observations to one reference

A single Mirror commitment is one data point. Many of them, about the same target, form a real distribution — and that distribution is itself information before any single reference is extracted from it. `mirror.js`'s own `computeResidualDiversity` computes real Shannon entropy over which sources a domain has actually reappeared with (`-Σ p·log₂p`) — this is the literal mechanism behind the app's own "entropic-space view" of what's been reconciled. It's a real, computable signal, never proof of independence: a small, entirely legitimate group that only interacts within itself produces the identical low entropy a colluding cluster would.

Extracting a single robust reference from a distribution is `weighted-median.js`'s job, used in two separate places (Causal Tick and relative-rate aggregation, below): sort by value, accumulate weight, return the value where cumulative weight first reaches half the total. Given estimates `10, 11, 12, 100` weighted `1, 2, 5, 1`, the total weight is 9, half is 4.5, and the cumulative weight reaches it at `12` — the outlier at `100` never gets to pull the result, because it doesn't hold anywhere near half the weight. That guarantee is real only as long as adversarial weight stays under half; a coalition that controls the majority isn't magically defeated by the median.

The weight itself matters as much as the median does. AIWA never counts "one identity, one vote" — that would recreate a Sybil problem immediately. `causal-tick.js` weights every estimate by a domain's own real, burned SOL (`identity-cost.js`), never by AIWA balance held — owning a lot of value never inflates your own observational weight.

## 10. The Causal Tick

`causal-tick.js` composes the pieces above into one interface: real evidence in, a Causal Tick out — or an honest `null` when evidence is insufficient, never a forced answer. Each real external observer contributes exactly one estimate (their own most-recent, highest-resolving observation of the target), so replaying the same true commitment, or having simply accumulated many old ones, never counts twice. The Tick is `weightedMedian` over those estimates, weighted by each observer's own burned capital. A domain can then check its own self-reported position against it — `gap = |selfReported − tick|`, consistent iff `gap ≤ tolerance` — with zero evidence yet counted as automatically consistent, since there's nothing to be inconsistent *with*. The Tick still never becomes a global clock: it's a local synthesis of whatever causal evidence this domain has actually received, not an instruction for what every domain must now agree to.

## 11. Comparing two histories without a clock: relative rate

`relative-rate.js` answers one more question: can two domains' *pace* be compared at all, with no shared clock anywhere? An observer signs two successive witnesses about the same target — `(observerEpoch₁, targetEpoch₁)` then `(observerEpoch₂, targetEpoch₂)` — and the relative rate is `(targetEpoch₂ − targetEpoch₁) / (observerEpoch₂ − observerEpoch₁)`. This is never a clock reading; it's a structural ratio between two already-verified progression deltas, and it never feeds back into what any domain is allowed to claim or how fast it may progress — purely informational, by the same principle Causal Tick already applies. Many such estimates aggregate the identical way Causal Tick's evidence does: `computeEmergentRate` runs the same weighted median, weighted by the same burned-capital measure. Composing two hops (`ρ_AB · ρ_BC = ρ_AC`) is real but was verified to be genuinely dangerous without a bound — a real, honest intermediate drift produced a measured 2× error in one tested scenario — so `composeRelativeRates` requires an explicit freshness bound and refuses to compose across a gap wider than it, rather than silently degrading.

## 12. Making expensive progression cheap to verify: Wesolowski

The plain hash chain in §2 has one real cost: verifying it costs exactly what producing it did. That's fine locally, but prohibitive for an external, gas-constrained verifier checking a chain of thousands or millions of iterations. `wesolowski-vdf.js` is a real, separate, asymmetric VDF (Wesolowski, 2018) over a public RSA-2048 modulus of unknown factorization: production still costs `T` real sequential modular squarings (`y = x^(2^T) mod N`), but verification costs only two modular exponentiations plus `O(log T)` work to derive the challenge, regardless of how large `T` is. The challenge prime `l` is itself derived deterministically — `hashToPrime(x‖T‖y)`, tested by Miller-Rabin with a fixed witness set — so no verifier ever gets to choose it, and two independent implementations always re-derive the same one.

## 13. The problem underneath all of it: the protocol can't depend on the language

AIWA is meant to run in both JavaScript and Rust. If the two compute a formula even slightly differently, `JS(result) ≠ Rust(result)` for "the same formula" — unacceptable for anything that determines a real amount. `interop/rust-vdf/` is a real, independent Rust implementation, written from the same specification each JS module documents, never a transpilation of it — and `tests/rust-interop.test.mjs` builds and runs it, comparing its output against the JS module's own, byte for byte, for real test vectors. This already covers canonicalization (§3), the weighted median (§9), Conservation's split invariant (§7), Mirror's monotonicity (§8), relative-rate's central ratio (§11), Causal Tick's consistency check (§10), the practical Wesolowski verification including prime derivation and Miller-Rabin (§12), and Ed25519 signatures checked against a genuinely different library (`ed25519-dalek`, never the JS side's `@noble/curves`).

**This is now also true of the reward formula itself.** `Math.log` and a fractional-exponent `Math.pow` were the one remaining gap: IEEE 754 guarantees `+ − × ÷` agree bit-for-bit across runtimes, but never transcendental functions — two different `libm` builds can legitimately disagree on the last bit, and reward's own output funds a real, on-chain claim (§4). `fixed-point-math.js` closes this: `ln`, `exp`, and fractional `pow` are computed from nothing but BigInt `+ − × ÷`, in Q128 binary fixed point — a fixed, hardcoded series-term count (never "until convergence," which would itself vary by runtime), exact IEEE-754 double decomposition at the Number↔Fixed boundary, and one rule enforced throughout: never bit-shift a negative BigInt, so neither side has to guess how the other's BigInt handles that. `reward.js`'s `rewardFixed` is the reproducible core; `reward()` itself is unchanged in signature and behavior. Verified concretely, not merely asserted: an independently-written Rust port produces the *exact same* BigInt, digit for digit, including for a full year of continuous progression (`3976466040673248597032750975172588536399082` for a basic case, `70070162968303128449516048132042380811409136` after ~112M epochs) — now part of `tests/rust-interop.test.mjs` alongside every other cross-runtime check. `accrual.js`'s own real claim path goes straight from that Fixed BigInt to on-chain base units (`fixedToUnits`), never through a float at all.

## 14. What AIWA deliberately doesn't do

It doesn't remove partitions, impose a world clock, force every state to converge, pick one instantaneous global truth, treat every observation as a vote, use financial balance as observational weight, or forbid histories from diverging. What it makes possible instead: **independent histories can stay independent, and still become causally correlated the moment they interact.**

## 15. The research question, in one sentence

*How do you compare causal units produced by independent identities, with no global synchronization, while keeping their histories divergent and their economic materialization exact?* AIWA's answer, experimentally: local progression + causal history + observation + weighted correlation + exact economic materialization. The question stops being "how do we build a world computer that behaves like one computer" and becomes "how do histories that never needed to become one history still talk to each other."

---

## Architecture

```
public/core/
  units.js               18-decimal fixed-point amounts, real bigint, never a float balance;
                         fixedToUnits() takes fixed-point-math.js's own Fixed value straight
                         to base units, no float in between
  fixed-point-math.js      Q128 binary fixed-point BigInt ln/exp/pow — a reproducible
                         replacement for Math.log/Math.pow, see §13
  domain-id.js            identity: SHA-256 of a public key
  event-dag.js             a content-addressed, causally-linked event set
  vdf.js                    sequential hash chain — bounds rate, not calendar time, by design
  bigint-math.js             modular exponentiation, Miller-Rabin primality, hash-to-prime
  wesolowski-vdf.js           a real asymmetric VDF — verification stays cheap regardless
                             of iteration count, unlike vdf.js's own simple chain
  progression.js            real epoch advancement, chained to a real VDF proof
  reward.js                 the accrual formula — rewardFixed() is the reproducible Q128
                           core, reward() a thin Number-returning wrapper over it
  accrual.js                 composes progression + reward into a real position per domain;
                             t resets on every burn or claim, A never resets
  conservation.js            claim lifecycle (deactivate/prove/verify/consume/activate),
                           split, and transmutation — real bigint, replay-proof by construction
  identity-cost.js           Genesis Commitment — a real Solana burn, churn-resistance curve
  churn-analysis.js           a real, parameter-specific check of whether that cost curve
                             actually makes repeatedly abandoning a domain for a fresh one
                             net-unprofitable, given concrete deployment parameters — never
                             a general guarantee
  solana-wallet.js            key generation (including passphrase-derived and real,
                             standard BIP39 + SLIP-0010, matching Phantom/Solflare's own
                             derivation exactly), encryption, real burn transaction
  weighted-median.js           real, adversarially-robust estimator — a minority of weight
                             cannot pull the result, as long as it stays below half
  causal-tick.js               a domain's externally-corroborated position, weighted by
                             real Genesis Commitment burns
  hardware-attestation.js       optional, real two-hop signature chain strengthening a
                             domain's own independence assurance — never a gate, never a
                             weight, AIWA works fully without it
  mirror.js                    reception commitments, monotonicity, residual diversity
  p2p-signaling.js              real offer/answer encoding for a manually-bootstrapped
                             live connection
  wallet.js                     composes accrual + conservation coherently, by construction —
                             a claim can never debit one side without the other
  relative-rate.js               real relative computation rate between two domains, without
                             ever consulting a clock — purely informational, burn-weighted
  generous-transfer.js           an external contract, not a protocol change: a real,
                             optional bonus a donor may attach to an ordinary transfer,
                             resolved deterministically by a real future VDF output of the
                             recipient's own chain — never chance, never a shared pool
  contract-registry.js           publishes any real contract's own source as a real,
                             content-addressed event — reachable from Give's own
                             "Publish a contract" card

public/app/
  the reference UI — Continuum (AIWA wallet, a real trajectory of your
  own causal history), Mirror (real reconciliation — a real, live
  WebRTC connection once bootstrapped by hand, or file export/import
  as a fallback; an entropic-space view of what you've observed, plus a
  real "Relative rate" card witnessing another domain's own real rate,
  §11), Ignition (Solana wallet), and Give — a fourth, real tab for
  generous-transfer.js: send a real, optional at-risk amount alongside
  an ordinary transfer, tracked from both the recipient's and the real
  donor's own side (generous-send-scan.js); resolved by the identical
  real progression loop already running; also hosts a real "Publish a
  contract" card for contract-registry.js (Yellow Paper §16)
  relative-rate-scan.js: pure, testable scan for this domain's own
  real, published rate witnesses (§11)
  p2p-connection.js: the real, live peer-to-peer sync itself (manual handshake)
  trystero-connection.js: an additional, optional transport — automatic peer
  discovery via real Nostr relays (Trystero), never a replacement for the
  manual one above; both share the identical sync-protocol.js
  sync-protocol.js: the real, transport-agnostic synchronization logic
  (full-sync, live relay, real verification on receipt) reused by every
  real transport this project supports
  state-snapshot.js: a real, verified cache of already-verified
  progression, so a reload never re-verifies a domain's entire
  history from genesis
  vdf-worker.js: the real, ongoing VDF computation runs here, on a
  dedicated thread, so it never competes with rendering or input
```

## t vs A, precisely

`t` is progression since this domain's own last economic action (a burn or a claim) — resets every time. `A` is this domain's own total progression age — never resets. Both are derived from the domain's own real, VDF-verified progression state; neither can be supplied directly by an event payload.

## Entropic space and Causal Tick only ever show what's been genuinely reconciled

Nothing here happens automatically, on any timer, or just because two devices are both online. A domain's Mirror only shows another domain once a real connection — live WebRTC or a file — has actually moved data between them, and a real reception commitment has been signed. Two devices using the identical identity (e.g. the same passphrase) never show each other here either — there is no separate "other" domain to observe in that case. This has nothing to do with whether either side has burned SOL.

## Real, verified cross-runtime interoperability

`interop/rust-vdf/` is a real, independent Rust implementation of a real, growing set of this protocol's own core computations — the sequential VDF chain, domain-id derivation, event canonicalization (§3 above), generous-transfer's own deterministic outcome (Yellow Paper §15), the weighted median (§9 above), Conservation's own split invariant (§7 above, real 18-decimal amounts), Mirror's own reception monotonicity (§8 above), relative-rate's own central ratio (§11 above), Causal Tick's own consistency check (§10 above), the real, *practical* Wesolowski verification (§12 above, including real prime-derivation and Miller-Rabin primality testing — the one path an external, gas-constrained chain would genuinely use, never the raw symmetric chain), Ed25519 signature verification (checked against a real, independent library, `ed25519-dalek`, never the real JS one this project actually uses), and now the reward formula's own Q128 fixed-point core (§13 above) — each written from the same specification, never by wrapping or transpiling the JS. `tests/rust-interop.test.mjs` builds it, runs it, and compares its real output against the real JS module's own output, byte for byte, for every one of these. This is what makes "the runtime never enters into the value" a real, checked property, not an assertion — see `interop/rust-vdf/README.md` for exactly what this does and does not claim.

**This is also the concrete confirmation behind Yellow Paper §16.1's own "native interchain" claim.** Every real primitive an external chain's own adapter would actually need — canonicalization, the cheap VDF proof, signatures, and now the reward computation itself — is confirmed genuinely portable outside JS, using genuinely different, independent libraries. Not an adapter itself, and no specific target chain has been chosen — that remains real, separate, future work for whoever builds it, on their own terms.

**Considered and deliberately not extended further, honestly.** `matching-contract.js` and `registerVerifiedContract` were considered for the same treatment — found, on inspection, to be real orchestration over already-verified primitives (Ed25519 signature checks, `resolveGenerousSend`'s own already-covered outcome logic, SHA-256 hashing) rather than new mathematical or cryptographic computation of their own. Reimplementing them in Rust would mostly re-verify functions already independently checked above, adding little real marginal coverage. `accrual.js`'s own surrounding event-sourcing state machine (position tracking, rejection handling) is likewise not covered — `rewardFixed`'s own arithmetic core is; the state machine around it exists only in JavaScript.

## Running locally

```
npm install
npm test
```

Open `public/index.html` through a real local server (module imports need `http://`, not `file://`) — e.g. `npx serve public`.

## Deployment

Automatic on push to `main` — `.github/workflows/deploy.yml` runs the real test suite first, deploys `public/` to GitHub Pages only if it passes.

## Honest, stated limits

- Ignition (Solana) requires a real, centralized, Earth-hosted RPC endpoint (`api.devnet.solana.com`) over real internet — activating an identity, checking a real SOL balance, sending real SOL, all need a genuine path back to Earth's own network. Once activated, a domain's own AIWA progression (Continuum) needs no further contact with Solana, or with Earth, ever again. This one step is the real exception to this whole project's own "never a shared clock, never continuous network access" principle — stated directly, not hidden.
- Devnet only. `identity-cost.js`'s own churn-resistance cost curve is real but optional, off by default.
- `p2p-connection.js` is real WebRTC code, reviewed carefully, but cannot be exercised by this project's own Node-based test suite — RTCPeerConnection has no real equivalent there. Test it yourself, in two real browser tabs, before relying on it. `trystero-connection.js` carries the identical honest limit, plus a real, third-party Nostr relay round-trip.
- `contract-registry.js` is real and tested, reachable from Give's own "Publish a contract" card — publishing embeds the real, complete source directly in the event, recoverable by anyone who receives it, never only a fingerprint.
- `wesolowski-vdf.js`'s own RSA-2048 modulus has been cross-checked, digit for digit, against three independent sources (Wikipedia, an encyclopedia mirror, and a math blog) and matches exactly across all three — real, though still short of a primary RSA Laboratories source, which is no longer live.
- Real browser coverage is whatever has been manually tested and reported back — not automated. A real attempt was made to add Playwright-based automated browser testing; the browser binary download is blocked by this development environment's own network egress rules, so this remains unautomated. Worth setting up yourself if you have unrestricted network access.
- `interop/rust-vdf/` verifies a real, specific set of functions (listed above) match byte-for-byte across JS and Rust — it is not a Rust port of the protocol, and no claim is made about any other module reproducing identically in another runtime without the same real work being done for it. Notably, full signature-based flows (real Mirror commitments, real rate witnesses) are exercised in JS with real Ed25519 signing; only the custom, non-cryptographic logic around them is what's cross-verified in Rust — the signature algorithm itself is standard, not this project's own risk to re-verify.
- `churn-analysis.js` answers whether churn is profitable for a specific, concrete choice of reward and cost-curve parameters — it is a real calculator, not a proof that any particular deployment's own chosen parameters are safe; run it against your own real numbers before trusting them.
- The real, standard BIP39 + SLIP-0010 derivation (`deriveKeypairFromBip39Mnemonic`) has been verified against three independent test vectors, cross-checked against a second, independent library, and matches Phantom/Solflare's own real, standard address exactly for each — real, but never tested against an actual, real Phantom or Solflare wallet in a real browser. Verify it yourself against a real wallet you control before trusting it with real funds.
- Mirror's reception monotonicity, and the residual-diversity entropy score, are both real, computable signals — neither proves two domains are genuinely distinct entities, and neither rules out a pair that has simply agreed in advance to produce a consistent-looking history together. No purely relational mechanism, with no external anchor, can close that gap.
- Causal Tick and the emergent relative rate both return an honest `null` when there isn't yet enough real evidence to compute one — never a forced or default answer standing in for missing evidence.
- The reward formula's `T` (patience) parameter is implemented and unit-tested in `reward.js`/`accrual.js`, but `public/app/ignition.js` — the only real place an `'accrual'` event is built — never sets it, and no accrual/wallet integration test does either. Every real position's `T` is `0` in the app as currently shipped; wiring a real, user-facing patience control remains real, undone work.

## License

MIT — see `LICENSE`.
