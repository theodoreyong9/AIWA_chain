# AIWA Chain

Two wallets, one identity. A Solana keypair activates a real, irreversible burn (Ignition); the same key then accrues native AIWA locally, continuously, based on time elapsed since your last action — never a shared clock, never continuous network access.

Live: https://theodoreyong9.github.io/AIWA_chain/

## What this is

A focused reference implementation of the AIWA protocol (see `docs/YELLOWPAPER.md`): identity, a real sequential-delay progression mechanism, an accrual formula, conservation of transferred value, and a real Mirror/reception layer — composed into two wallets, not a general-purpose platform. No modules, no plugin registry, no pools, no peer-to-peer exchange. That scope was deliberately cut to get this part right first.

130 real tests, no skips, security-relevant cases named as such.

## Architecture

```
public/core/
  units.js          18-decimal fixed-point amounts, real bigint, never a float balance
  domain-id.js       identity: SHA-256 of a public key
  event-dag.js        a content-addressed, causally-linked event set
  vdf.js               sequential hash chain — bounds rate, not calendar time
  bigint-math.js        modular exponentiation, Miller-Rabin primality, hash-to-prime
  wesolowski-vdf.js      a real asymmetric VDF — verification stays cheap regardless
                        of iteration count, unlike vdf.js's own simple chain
  progression.js       real epoch advancement, chained to a real VDF proof
  reward.js            the accrual formula
  accrual.js            composes progression + reward into a real position per domain;
                        t resets on every burn or claim, A never resets
  conservation.js       transfer and split of already-claimed value, real bigint
  identity-cost.js      Genesis Commitment — a real Solana burn, churn-resistance curve
  solana-wallet.js       key generation, encryption, real burn transaction
  weighted-median.js      real, adversarially-robust estimator — a minority of weight
                        cannot pull the result, as long as it stays below half
  causal-tick.js          a domain's externally-corroborated position, weighted by
                        real Genesis Commitment burns — real and tested, not yet
                        surfaced in the reference UI
  wallet.js               composes accrual + conservation coherently, by construction —
                          a claim can never debit one side without the other

public/app/
  the reference UI — Continuum (AIWA wallet, a real trajectory of your
  own causal history), Mirror (real reconciliation — export/import a
  real history file, commit a real, signed reception of what you
  actually now know, an entropic-space view of what you've observed),
  and Ignition (Solana wallet)
```

## t vs A, precisely

`t` is time since this domain's own last economic action (a burn or a claim) — resets every time. `A` is this domain's own total progression age — never resets. Both are derived from the domain's own real, VDF-verified progression state; neither can be supplied directly by an event payload. An earlier version of this let the caller declare its own reference epoch — a real, closed gap, not a hypothetical one.

## Running locally

```
npm install
npm test
```

Open `public/index.html` through a real local server (module imports need `http://`, not `file://`) — e.g. `npx serve public`.

## Deployment

Automatic on push to `main` — `.github/workflows/deploy.yml` runs the real test suite first, deploys `public/` to GitHub Pages only if it passes. `.github/workflows/ci.yml` runs the same suite on every other branch and pull request.

## Honest, stated limits

- The reward formula's fractional exponents require floating-point computation internally — `fromFloat()` (`units.js`) converts the result to a real, exact bigint at that boundary, faithful to what the float actually holds, never fabricating precision it doesn't have.
- Devnet only. `identity-cost.js`'s own churn-resistance cost curve is real but optional, off by default.
- No real peer-to-peer transport in this scope — Mirror/reception is real and tested, but only ever fed by this same local domain's own events. A second, independent domain reconciling with this one is a real, separate piece of work, not attempted here.
- The VDF (`vdf.js`) is a real sequential hash chain, not an asymmetric cryptographic VDF (Wesolowski, Pietrzak) — verifying costs what producing costs. It bounds the rate of production; it makes no claim about calendar time, and none is made in `docs/YELLOWPAPER.md`.
- Nothing here has been run in a real browser by the person building it. IndexedDB persistence, the burn transaction, and the rendered UI are real code, reviewed carefully, syntax-checked — not the same claim as verified working end to end. Test it yourself before trusting it with real value.
- `wesolowski-vdf.js`'s own RSA-2048 modulus was transcribed from a single web source during development, never independently cross-verified against a second, fully authoritative source. Verify it yourself before real use — see that file's own header.
- `causal-tick.js` is real, tested, and now wired into the reference UI (Continuum shows it) and `app.js`'s own rematerialization — but it remains a real, additional corroboration layer, never a substitute for a domain's own VDF-bound progression, which stays the only unconditional protection (see the Yellow Paper's own §13).

## License

Not yet decided.
