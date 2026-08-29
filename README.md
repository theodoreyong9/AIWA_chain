# AIWA Chain

Two wallets, one identity. A Solana keypair activates a real, irreversible burn (Ignition) — the one real step that needs genuine internet access to Earth's own Solana network. The same key then accrues native AIWA locally, continuously, based on time elapsed since your last action — never a shared clock, never any further network access, ever again.

Live: https://theodoreyong9.github.io/AIWA_chain/

## What this is

A focused reference implementation of the AIWA protocol (see `docs/YELLOWPAPER.md`): identity, a real sequential-delay progression mechanism, an accrual formula, conservation of transferred value, a real Mirror/reception layer, and a real weighted Causal Tick — composed into two wallets, not a general-purpose platform. No modules, no plugin registry, no pools. That scope was deliberately cut to get this part right first.

275 real tests, security-relevant cases named as such — all but one run unconditionally; the real cross-runtime check skips gracefully, never fails, if no Rust toolchain is available.

## The design principle this whole project is built around

Progression is bound to real, sequential computation (a VDF) — never a shared clock, never calendar time. This is not a limitation stated apologetically; it is the one property that makes Earth and Mars able to accrue value independently, for any length of partition, without ever needing to synchronize. A domain that computes continuously genuinely advances faster than one that doesn't — that is the intended, load-bearing behavior, not a bug to hide.

## How this differs from extending a single chain across the latency gap

Published proposals for interplanetary cryptocurrency generally keep one, Earth-anchored consensus chain and add delay-tolerant transport, wider payment-channel timelocks, and federated settlement on top — a real, workable answer for transferring already-created value under real latency. That approach carries a real, acknowledged cost on the other half of the problem: value *creation* stays dominated by whichever side has more real compute, since mining from Mars against Earth's own hashpower is, by that same literature's own account, structurally unprofitable. This project takes value creation itself off any consensus chain entirely — a domain creates real, VDF-bound value at its own real pace, from its own committed capital, with zero dependency on anyone else's compute or connectivity; reconciliation only ever adds a real, informational signal afterward, never a correction. See `docs/YELLOWPAPER.md` §11.1 for the fuller, cited version of this — including what still isn't solved here (the real transport itself, and any real exchange rate between two economies that grew up apart).

## Yellow Paper, in LaTeX and as a real PDF

`docs/YELLOWPAPER.tex` is the real, source-of-truth LaTeX version — `docs/YELLOWPAPER.md` stays as the plain-text version for reading directly on GitHub. `public/YELLOWPAPER.pdf` is a real, pre-built PDF (compiled and visually verified page by page before being committed), served directly by the app itself — the "Yellow Paper" link in the top bar of every tab opens it. If you edit the `.tex`, regenerate the PDF and copy it back into `public/`:

```
cd docs && pdflatex YELLOWPAPER.tex && pdflatex YELLOWPAPER.tex && cp YELLOWPAPER.pdf ../public/
```

(twice, so LaTeX's own cross-references resolve correctly — the first pass leaves them as `??`).

## Architecture

```
public/core/
  units.js               18-decimal fixed-point amounts, real bigint, never a float balance
  domain-id.js            identity: SHA-256 of a public key
  event-dag.js             a content-addressed, causally-linked event set
  vdf.js                    sequential hash chain — bounds rate, not calendar time, by design
  bigint-math.js             modular exponentiation, Miller-Rabin primality, hash-to-prime
  wesolowski-vdf.js           a real asymmetric VDF — verification stays cheap regardless
                             of iteration count, unlike vdf.js's own simple chain
  progression.js            real epoch advancement, chained to a real VDF proof
  reward.js                 the accrual formula
  accrual.js                 composes progression + reward into a real position per domain;
                             t resets on every burn or claim, A never resets
  conservation.js            transfer and split of already-claimed value, real bigint
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
                             content-addressed event — no interface yet; code-only today

public/app/
  the reference UI — Continuum (AIWA wallet, a real trajectory of your
  own causal history), Mirror (real reconciliation — a real, live
  WebRTC connection once bootstrapped by hand, or file export/import
  as a fallback; an entropic-space view of what you've observed), and
  Ignition (Solana wallet)
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

`t` is time since this domain's own last economic action (a burn or a claim) — resets every time. `A` is this domain's own total progression age — never resets. Both are derived from the domain's own real, VDF-verified progression state; neither can be supplied directly by an event payload.

## Entropic space and Causal Tick only ever show what's been genuinely reconciled

Nothing here happens automatically, on any timer, or just because two devices are both online. A domain's Mirror only shows another domain once a real connection — live WebRTC or a file — has actually moved data between them, and a real reception commitment has been signed. Two devices using the identical identity (e.g. the same passphrase) never show each other here either — there is no separate "other" domain to observe in that case. This has nothing to do with whether either side has burned SOL.

## Real, verified cross-runtime interoperability

`interop/rust-vdf/` is a real, independent Rust implementation of the protocol's own most fundamental computation — the sequential VDF chain and domain-id derivation — written from the same specification, never by wrapping or transpiling the JS. `tests/rust-interop.test.mjs` builds it, runs it, and compares its real output against the real JS module's own output, byte for byte. This is what makes "the runtime never enters into the value" a real, checked property, not an assertion — see `interop/rust-vdf/README.md` for exactly what this does and does not claim.

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

- The reward formula's fractional exponents require floating-point computation internally — `fromFloat()` (`units.js`) converts the result to a real, exact bigint at that boundary, faithful to what the float actually holds, never fabricating precision it doesn't have.
- Devnet only. `identity-cost.js`'s own churn-resistance cost curve is real but optional, off by default.
- `p2p-connection.js` is real WebRTC code, reviewed carefully, but cannot be exercised by this project's own Node-based test suite — RTCPeerConnection has no real equivalent there. Test it yourself, in two real browser tabs, before relying on it. `trystero-connection.js` carries the identical honest limit, plus a real, third-party Nostr relay round-trip.
- `contract-registry.js` is real and tested, but has no interface yet — publishing or reading a contract-spec today means calling it directly by code, never through Continuum, Ignition, or Mirror. A genuine proof of concept, not a finished feature.
- `wesolowski-vdf.js`'s own RSA-2048 modulus has been cross-checked, digit for digit, against three independent sources (Wikipedia, an encyclopedia mirror, and a math blog) and matches exactly across all three — real, though still short of a primary RSA Laboratories source, which is no longer live.
- Real browser coverage is whatever has been manually tested and reported back — not automated. A real attempt was made to add Playwright-based automated browser testing; the browser binary download is blocked by this development environment's own network egress rules, so this remains unautomated. Worth setting up yourself if you have unrestricted network access.
- `interop/rust-vdf/` verifies one real function (the sequential VDF chain) matches byte-for-byte across JS and Rust — it is not a Rust port of the protocol, and no claim is made about any other module reproducing identically in another runtime without the same real work being done for it.
- `churn-analysis.js` answers whether churn is profitable for a specific, concrete choice of reward and cost-curve parameters — it is a real calculator, not a proof that any particular deployment's own chosen parameters are safe; run it against your own real numbers before trusting them.
- The real, standard BIP39 + SLIP-0010 derivation (`deriveKeypairFromBip39Mnemonic`) has been verified against three independent test vectors, cross-checked against a second, independent library, and matches Phantom/Solflare's own real, standard address exactly for each — real, but never tested against an actual, real Phantom or Solflare wallet in a real browser. Verify it yourself against a real wallet you control before trusting it with real funds.

## License

MIT — see `LICENSE`.
