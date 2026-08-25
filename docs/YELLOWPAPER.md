# AIWA Yellow Paper

## Causal Coordination and Local Value Accrual for Partition-Tolerant Networks

**Version 1.1 — reference implementation specification**

---

## Abstract

AIWA is a distributed coordination and value-accrual primitive for networks operating under arbitrary communication delay, intermittent connectivity, and long-duration partition.

AIWA separates two problems that are conventionally coupled.

**Causal coordination** derives a deterministic causal layer for authenticated events from a common genesis, causal history, and Mirror observations. Independent domains continue operating while disconnected and reconcile later, when evidence becomes available.

**Accrual** provides controlled, *local* creation of value. An identity is activated through an externally anchored Genesis Commitment (a real Solana burn). Its claimable value then evolves according to a deterministic progression function, driven by real sequential computation, not a shared clock. Claiming converts accrued value into native AIWA balance and resets the domain's own patience clock. Once claimed, AIWA transfers between wallets through authenticated causal history, with no continued dependency on the external activation chain.

> **Progression determines how much value a domain may claim.
> Conservation determines who owns the resulting value.
> Mirror determines what history can be verified.
> Neither requires a globally synchronized state.**

---

## 1. System model

An AIWA network consists of autonomous identities and domains. An identity is controlled by a cryptographic key pair. A domain is an operational environment holding one or more identities and their local state.

Communication may be continuous, intermittent, delayed, asymmetric, or unavailable for an arbitrary period.

AIWA assumes standard cryptographic primitives — collision-resistant hashing, secure digital signatures, deterministic serialization — and does not require a globally synchronized wall clock, continuous external-chain access, a global consensus quorum, or a globally replicated balance state.

## 2. Identity

An identity is a public key. Its address is:

```
domain(i) = SHA-256(publicKey_i)
```

the full 256-bit digest, hex-encoded, never truncated. The private key authorizes actions; the physical device is not the identity. An identity can move between devices — Earth, a spacecraft, Mars, a new device — while retaining the same cryptographic identity, with no inherent binding to a location, IP address, or machine.

## 3. Event DAG

All state transitions are signed events referencing their causal predecessors, forming a directed acyclic graph. No participant is required to possess every event; a participant maintains and verifies the history relevant to its own state and the relationships it observes. Merging two independently-grown DAGs is a pure, commutative union.

## 4. Mirror

A Mirror is a domain's local, signed, authenticated record of what it has actually observed and verified concerning other domains — never a replica of the observed domain, never a global state database.

A commitment is either `empty` (nothing received this epoch) or `full` (a real, verifiable set of references to source events). Reception monotonicity holds: a domain's own successive claims about what it has seen of another domain must never claim to have seen *less* than it previously, verifiably claimed.

Mirror does not prove two domains are distinct real entities, and does not rule out a genuinely collaborating pair fabricating a consistent history together — no purely relational mechanism, with no external anchor, can close that gap. It is real evidence about the structure of observed history, not an identity oracle.

## 5. Progression

A domain's own progression epoch advances only through a valid transition: exactly `+1`, causally chained to the domain's own last accepted transition, and carrying a real sequential proof (§6).

Progression is never shared or synchronized across domains. Two domains' epoch counts are never directly comparable — each is a purely local measure of that domain's own advancement.

## 6. The sequential proof

Each progression transition carries a real, verifiable sequential hash chain:

```
h_0 = SHA-256(seed)
h_i = SHA-256(h_{i-1})
```

seeded from the domain and the previous epoch's own output — chaining across epochs, not merely within one, so epoch *N* cannot begin before epoch *N-1* has genuinely finished.

This is not an asymmetric cryptographic VDF (Wesolowski, Pietrzak) — verifying costs exactly what producing costs, not asymptotically less. What it provides is unconditional: production cannot be parallelized or shortcut by any amount of hardware. It bounds the *rate* at which a domain can advance its own progression; it makes no claim about calendar time. A domain with sustained, continuous compute available genuinely can advance faster than one without it — that is the property, not a flaw in it.

## 7. Accrual

Once activated (§9), a domain accrues claimable AIWA as a function of three quantities:

```
R(S, t, A) = S · t^α / [β·ln(A) + ln(1 + C/A^β)]^γ
```

- **S** — committed value (from Genesis Commitment and any later commitment).
- **t** — real progression epochs elapsed **since this domain's own last economic action** (a burn or a claim). Resets to zero on every such action.
- **A** — this domain's own **total** progression age. Never resets.
- **α, β, γ, C** — deployment parameters.

### 7.1 Why t resets and A does not

This is the one precise, load-bearing distinction in the whole formula, and an earlier draft of this specification did not state it clearly enough to prevent a real implementation bug: `t` must never be a value the claiming domain supplies. A domain that could declare its own reference epoch could always declare the earliest one available, maximizing `t` forever. `t` and `A` are therefore both derived exclusively from the domain's own already-verified progression state (§5) at the moment of the query — recomputed, never trusted from any event payload.

Resetting `t` on every claim gives the formula its real economic meaning: reward is for patience since you last touched your position, not since you first opened it. `A`, left unreset, provides the formula's own denominator — a measure of overall maturity independent of any individual domain's own claiming pattern.

### 7.2 The computable form

The denominator is represented as `β·ln(A) + ln(1 + C/A^β)` rather than `ln(A^β + C)` directly — the same value (`β·ln(A) + ln(1+C/A^β) = ln(A^β+C)`, a real logarithmic identity), computed this way to reduce overflow risk for large `A`.

## 8. Genesis Commitment

Identity activation is a real, irreversible SOL burn to Solana's public incinerator address, verified from an already-fetched, finalized transaction record — never a self-declared amount. The same keypair that burns is the keypair AIWA accrues to; there is no second, AIWA-only key.

The accrual formula is linear in `S` — absent an identity cost, splitting capital across many identities would not by itself reduce total accrual. A per-identity activation cost, optionally scaled by a real cost curve as protocol time passes, makes churn (abandoning an aged domain for a fresh one) strictly costlier, not free. A new identity inherits none of an old one's progression, Mirror history, or claimed value.

## 9. Conservation

Once claimed, AIWA is a discrete, owned unit (a claim), moved by a real, signed transfer, or divided by a real, signed split into two claims whose amounts sum exactly to the original — enforced by construction (exact integer subtraction), not by a separate check that could be wrong.

A transfer requires a real signature proving control over the source domain; an unsigned or forged transfer is rejected before it can touch any claim. Neither operation requires continued access to the domain's own progression or to the external activation chain — a claimed AIWA is fully portable local value.

## 10. Denomination

AIWA uses 18 decimal places. `1 AIWA = 10^18 base units`. Every claim, transfer, and split amount is a real integer count of base units — never a floating-point approximation of a balance. The accrual formula's own fractional exponents require floating-point computation internally; the result is converted to an exact integer at the one real boundary where it becomes part of a balance, faithful to what the float actually holds.

## 11. Partition and reconciliation

During a partition, each domain continues independently — no domain decrements its own state because another is unreachable, and none waits for permission to continue. Reconciliation, when connectivity resumes, is real signature verification, real ancestry verification, and real Mirror-observation verification over the newly available evidence — never a question of whose clock is correct.

## 12. Explicit non-claims

AIWA does not claim to solve the human-identity oracle, perfect physical-location verification, absolute global time, Byzantine agreement without assumptions, or detection of every coalition of identities controlled by one real actor. These are structural boundaries, stated directly, not omitted implementation details.

A coalition can produce internally consistent history at real cost — valid keys, valid signatures, valid ancestry, valid Mirror commitments, and whatever economic commitment the protocol requires. AIWA's claim is narrower and precise: fabricated identities cannot fabricate authenticated history for free.

---

## 13. Causal Tick

There is one real interface, not two: evidence in, a Causal Tick (or an honest, explicit absence) out. "Local" and "cross-domain" are not separate mechanisms — the identical function, given more evidence (a newly-imported domain's history, a newly-signed reception commitment), produces a more refined result. There is no second synchronization protocol for when a partition reconnects; there is only this same function seeing more of what already exists.

A domain's own progression (§5) remains the unconditional source of truth for its own accrual — real, VDF-bound, secure even with zero external observers. The Causal Tick is a complementary, real, externally-corroborated position: for a target domain, every other domain's Mirror commitments referencing it are gathered, each weighted by that observer's own real, already-verified Genesis Commitment burn (§8) — never a self-declared score. The weighted median of these observations is the Causal Tick; the real spread between the lowest and highest individual observation is reported alongside it as an interval, not discarded. A minority of adversarial weight cannot pull the result arbitrarily, as long as it stays below half of the total real weight observing that domain — the same real, well-studied security shape as proof-of-stake, applied here to causal positioning.

A domain with no external observers yet has no Causal Tick at all (⊥, insufficiently determined) — a real, honest absence, never treated as inconsistency.

### 13.1 Hardware roots are optional, and never an authority

AIWA's evidence interface works with software primitives alone. A domain may optionally strengthen its own independence assurance with real, physically-provisioned hardware roots — but hardware never computes the Causal Tick, never sets or scales any observer's weight, and never becomes a required input. A domain backed by zero hardware attestations and one backed by several produce an identical Causal Tick from identical Mirror evidence; only a separate, informational confidence signal (how much of the corroborating weight is also hardware-backed) differs.

A real attestation is a two-hop signature chain: an already-established origin domain signs the issuance of a specific hardware root; that hardware root's own key signs its binding to a specific domain. Both signatures are independently verified — never trusted from the record's own claims about itself. A real minimum of two distinct, independently-issued roots is required for a domain's own minimal independence hypothesis to hold; one root only moves trust to a single unit, never establishes a real minimum.

Stated directly, the one honest limit no cryptographic protocol closes: nothing here can verify from software alone that a hardware root's key really lives on real, non-clonable hardware. What real verification provides is a real, traceable chain of signatures from a known origin — reducing the trust surface from "any of many sybil identities" to "compromising the origin's own issuance process, or one specific physical unit" — a real, meaningful reduction, never an absolute physical guarantee.

---

## Reference implementation

| Concept | File |
|---|---|
| Identity | `public/core/domain-id.js` |
| Event DAG | `public/core/event-dag.js` |
| Sequential proof (§6) | `public/core/vdf.js`, `public/core/wesolowski-vdf.js` (asymmetric, real cheap verification — see that file's own header for its one honest, stated limit), `public/core/bigint-math.js` |
| Progression (§5) | `public/core/progression.js` |
| Accrual formula (§7) | `public/core/reward.js` |
| Accrual position, t/A (§7.1) | `public/core/accrual.js` |
| Genesis Commitment (§8) | `public/core/identity-cost.js`, `public/core/solana-wallet.js` |
| Conservation (§9) | `public/core/conservation.js` |
| Denomination (§10) | `public/core/units.js` |
| Mirror (§4) | `public/core/mirror.js` |
| Causal Tick (§13) | `public/core/causal-tick.js`, `public/core/weighted-median.js` — real, tested, and wired into the reference UI; never a substitute for a domain's own VDF-bound progression, the only unconditional protection |
| Hardware roots, optional (§13.1) | `public/core/hardware-attestation.js` — real, tested, standalone; never consumed as a gate or a weight |
| Coherent composition | `public/core/wallet.js` |

179 real tests cover this table; none are skipped, and security-relevant cases are named as such in their own test files.
