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
  solana-wallet.js            key generation, encryption, real burn transaction
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
  progression (by real event-id set, never by position in any
  particular topological ordering), so a reload never re-verifies a
  domain's entire history from genesis — see below
  vdf-worker.js: the real, ongoing VDF computation runs here, on a
  dedicated thread, so it can never compete with rendering or input
  handling no matter how long a session runs
```

## t vs A, precisely

`t` is time since this domain's own last economic action (a burn or a claim) — resets every time. `A` is this domain's own total progression age — never resets. Both are derived from the domain's own real, VDF-verified progression state; neither can be supplied directly by an event payload. An earlier version of this let the caller declare its own reference epoch — a real, closed gap, not a hypothetical one.

## Why a reload doesn't re-verify everything from genesis

Verifying a domain's progression is real work — that's the point (see above). But re-doing that same work on every single page reload, for a domain that's been running for a while, doesn't need to happen: `state-snapshot.js` persists a real, already-verified wallet state every 25 events, tagged with the exact SET of event ids it covers — never a position or count, which has no guaranteed stability once a local DAG holds more than one domain's events (two independent domains' events have no fixed relative order in a topological sort). On load, catch-up work is simply every current event not in that set, regardless of where it falls in any particular ordering.

## Why every action doesn't re-verify everything either

The same real cost applies to claiming, sending, and igniting, not just reloading — an earlier version of this re-ran a full history fold after every single one of these too. Every user action now applies directly to the already-materialized state instead.

## Why a browser might keep showing an old version

GitHub Pages and browsers both cache JS modules aggressively by default — a hard refresh (Ctrl+Shift+R / Cmd+Shift+R) or clearing the site's storage is sometimes necessary to see a freshly deployed change, independent of anything in this codebase. If something looks stale after a deploy, try that before assuming the deploy itself failed.

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
- No real peer-to-peer transport in this scope — Mirror/reception is real and tested, and reconciliation between two genuinely separate domains has now been exercised for real (Mirror tab: export a real history file, import it on the other side, commit a real, signed reception). What's real and working: the commitment, its signature, its monotonicity check, the entropic-space view of what's been committed. What's still missing: any live transport — right now, moving the file between two domains is always a manual step, never automatic. Two separate devices (or two browser profiles) never see each other's data until a file physically moves between them; there's no relationship to whether either side has burned SOL.
- This has now genuinely been run in a real browser, more than once, with real bugs found and fixed as a direct result — a module-resolution failure, a main-thread VDF loop that froze the tab, a snapshot verification that assumed a topological-order stability that wasn't guaranteed, several actions that silently re-verified a domain's entire history instead of updating incrementally. Real testing surfaced all of these; none were found by code review alone. Still worth testing yourself before trusting it with real value — this project's own history is the argument for why.
- `wesolowski-vdf.js`'s own RSA-2048 modulus was transcribed from a single web source during development, never independently cross-verified against a second, fully authoritative source. Verify it yourself before real use — see that file's own header.

## License

Not yet decided.
