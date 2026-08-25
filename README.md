# AIWA Chain

Two wallets, one identity. A Solana keypair activates a real, irreversible burn (Ignition); the same key then accrues native AIWA locally, continuously, based on time elapsed since your last action — never a shared clock, never continuous network access.

Live: https://theodoreyong9.github.io/AIWA_chain/

## What this is

A focused reference implementation of the AIWA protocol (see `docs/YELLOWPAPER.md`): identity, a real sequential-delay progression mechanism, an accrual formula, conservation of transferred value, a real Mirror/reception layer, and a real weighted Causal Tick — composed into two wallets, not a general-purpose platform. No modules, no plugin registry, no pools, no peer-to-peer exchange. That scope was deliberately cut to get this part right first.

192 real tests, no skips, security-relevant cases named as such.

## The design principle this whole project is built around

Progression is bound to real, sequential computation (a VDF) — never a shared clock, never calendar time. This is not a limitation stated apologetically; it is the one property that makes Earth and Mars able to accrue value independently, for any length of partition, without ever needing to synchronize. A domain that computes continuously genuinely advances faster than one that doesn't — that is the intended, load-bearing behavior, not a bug to hide.

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
  solana-wallet.js            key generation (including passphrase-derived), encryption,
                             real burn transaction
  weighted-median.js           real, adversarially-robust estimator — a minority of weight
                             cannot pull the result, as long as it stays below half
  causal-tick.js               a domain's externally-corroborated position, weighted by
                             real Genesis Commitment burns
  hardware-attestation.js       optional, real two-hop signature chain strengthening a
                             domain's own independence assurance — never a gate, never a
                             weight, AIWA works fully without it
  mirror.js                    reception commitments, monotonicity, residual diversity
  wallet.js                     composes accrual + conservation coherently, by construction —
                             a claim can never debit one side without the other

public/app/
  the reference UI — Continuum (AIWA wallet, a real trajectory of your
  own causal history), Mirror (real reconciliation — export/import a
  real history file, commit a real, signed reception of what you
  actually now know, an entropic-space view of what you've observed),
  and Ignition (Solana wallet)
  state-snapshot.js: a real, verified cache of already-verified
  progression, so a reload never re-verifies a domain's entire
  history from genesis
  vdf-worker.js: the real, ongoing VDF computation runs here, on a
  dedicated thread, so it never competes with rendering or input
```

## t vs A, precisely

`t` is time since this domain's own last economic action (a burn or a claim) — resets every time. `A` is this domain's own total progression age — never resets. Both are derived from the domain's own real, VDF-verified progression state; neither can be supplied directly by an event payload.

## Entropic space and Causal Tick only ever show what's been genuinely reconciled

Nothing here happens automatically, on any timer, or just because two devices are both online. A domain's Mirror only shows another domain once you (or that other domain) have exported a real history file, imported it on the other side, and signed a real reception commitment about it in the Mirror tab. Two devices using the identical identity (e.g. the same passphrase) never show each other here either — there is no separate "other" domain to observe in that case. This has nothing to do with whether either side has burned SOL.

## Running locally

```
npm install
npm test
```

Open `public/index.html` through a real local server (module imports need `http://`, not `file://`) — e.g. `npx serve public`.

## Deployment

Automatic on push to `main` — `.github/workflows/deploy.yml` runs the real test suite first, deploys `public/` to GitHub Pages only if it passes.

## Honest, stated limits

- The reward formula's fractional exponents require floating-point computation internally — `fromFloat()` (`units.js`) converts the result to a real, exact bigint at that boundary, faithful to what the float actually holds, never fabricating precision it doesn't have.
- Devnet only. `identity-cost.js`'s own churn-resistance cost curve is real but optional, off by default.
- No real peer-to-peer transport. Mirror/reception, including reconciliation between two genuinely separate domains, is real, tested, and has been exercised end to end — but always by hand: exporting a file, moving it, importing it, signing a commitment. Nothing here connects two domains automatically.
- `wesolowski-vdf.js`'s own RSA-2048 modulus was transcribed from a single web source during development, never independently cross-verified against a second, fully authoritative source. Verify it yourself before real use — see that file's own header.
- `hardware-attestation.js` is real and tested but not yet reachable from the UI — there is no way, today, to actually issue or bind a hardware root from the app itself.
- Real browser coverage is whatever has been manually tested and reported back — not automated, not comprehensive across browsers or devices.

## License

MIT — see `LICENSE`.
