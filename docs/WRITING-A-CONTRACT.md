# Writing a contract — a real guide, from real lessons

This is not abstract advice. Every rule here comes from something
either verified concretely while building `generous-transfer.js`, or
from a real, specific vulnerability found and closed along the way.
Where a rule exists because something broke, that's stated plainly —
so the next contract doesn't have to rediscover it the hard way.

## 1. What "a contract" means here

A contract is a real, ordinary JS module — never a change to
`wallet.js`, `progression.js`, `conservation.js`, or any other core
file. It *consumes* their already-exported functions. This is not a
style preference: §15.1 and §15.2 of the Yellow Paper explain why —
briefly, no shared execution environment exists here (no EVM), so
"the protocol" can never call into unknown, arbitrary code; a
contract's own real logic runs wherever whoever cares to run it
chooses to run it, verified independently by anyone who wants to.

## 2. Give it a real, immutable identity

```js
export const CONTRACT_ID = 'your-contract-name-v1';
```

Never just a string floating in your code — it has to be part of
*signed* content (see step 3), and the contract's own real source
should be published, once, via `contract-registry.js`:

```js
import { publishContractSpec } from '../core/contract-registry.js';
await publishContractSpec(dag, { name: 'your-contract', version: 1, sourceCode, description });
```

**Why**: an unpublished `CONTRACT_ID` is just a name anyone could
reuse for something else entirely. A published, content-addressed
spec means the id is tied to the *exact, real, complete source* —
verified concretely (§16): a single altered character produces a
genuinely different real hash.

**A real, verified risk if you skip this**: a signature check alone
(step 3) only ever proves "this was signed by this key, over this
exact content" — never "this came from the real, trusted module you
think it did." Nothing stops a real, different, possibly malicious
contract from simply *choosing* an existing `CONTRACT_ID` string —
verified concretely: a forged commitment claiming
`aiwa-generous-transfer-v1` passes its own real signature check just
fine. Before ever registering someone else's `verifyPayout` in your
own `contractVerifiers`, verify their real source against a real,
published hash (`verifyContractSource`) — never trust the name alone.

## 3. Every real commitment your contract signs must include `CONTRACT_ID`

```js
function canonicalMessage({ contractId, /* ...your real fields */ }) {
  return JSON.stringify({ contractId, /* ... */ });
}
```

**Why**: without this, `verifyGenerousSendSignature`-style checks
can't tell "a real commitment for my contract" from "a real
commitment for someone else's, that happens to share a field name."
A real, explicit mismatch must be rejected outright — never assumed
to belong to your contract by default (verified in
`generous-transfer.test.mjs`: a commitment claiming a different
`contractId` is rejected, even with an otherwise-valid signature).

## 4. If your contract needs unpredictability: never randomness

Real randomness can't be verified by a third party after the fact.
What can: a real, future, VDF-verified progression event of
*someone's own chain* — the identical property mining relies on
(§15). Two real security lessons, found and closed here, apply
directly to any future contract doing this:

**Never key your outcome on a full event's own id.** An id includes
cheap-to-vary fields (which extra parents are attached). A real
attacker can privately construct many candidate events reusing the
identical, already-computed real VDF output, checking each outcome,
revealing only a favorable one — verified concretely: five candidates,
three "wins," from one real VDF computation. Key your outcome on the
raw `vdfOutput` string itself — genuinely expensive to vary, unlike an
event's own full id.

**Never trust a `vdfOutput` you haven't independently re-verified.**
A fabricated string, never really computed, can be ground for a
favorable hash directly if nothing checks it's real. Always call the
real VDF verification (`verifyVdfChain`/`vdfSeed`, or reuse
`verifyQualifyingEpoch` if your shape matches) against the real,
known prior output — never trust the event's own shape alone.

## 5. If your contract needs to move real, spendable AIWA

Never invent your own balance tracking. Move it through Conservation
the one, real, generic way:

```js
export async function verifyPayout(payload) {
  // your own, real, contract-specific checks — signature, condition, etc.
  // return the real transfer fields if — and only if — everything checks out:
  return { claimId, from, to, nonce, timestamp, signerPubkey, signature };
  // or return null on ANY failure — never partial, never assumed
}
```

Then the application registers it:

```js
const CONTRACT_VERIFIERS = { [YourContract.CONTRACT_ID]: YourContract.verifyPayout };
await applyWalletEvent(rewardParams, state, event, verifyFn, CONTRACT_VERIFIERS);
```

**Why this shape, precisely**: `wallet.js` independently verifies the
real transfer signature itself (identical to an ordinary `transfer`)
*before* ever calling your `verifyPayout` — your contract only ever
answers "are my own real conditions genuinely met," never
re-implements signature checking. An unregistered `contractId` is
refused outright; nothing is trusted by default (verified:
`wallet-generous-payout.test.mjs`'s own empty-registry test). This is
the one, narrow, explicit exception to "never touch the core" — and
even it never required editing `wallet.js`'s own source a second
time, by design (§15.2).

## 6. Composing with another real contract

No shared execution environment exists here (§1, no EVM) — composing
can only ever mean a real, ordinary JS import, calling another
contract's own real, exported function. `matching-contract.js` is a
real, second, working example — a real third party pre-commits to
also sending a bonus if a specific, real `generous-transfer.js` offer
resolves as a win, verified by directly calling that contract's own
real `resolveGenerousSend`, never a re-implementation of it:

```js
import { resolveGenerousSend, CONTRACT_ID as WRAPPED_CONTRACT_ID } from './generous-transfer.js';

export async function verifyPayout(payload) {
  // your own real checks first...
  const wrappedResult = await resolveGenerousSend(payload.wrappedProof);
  if (!wrappedResult || !wrappedResult.won) return null; // the wrapped contract's own real outcome, genuinely propagated
  return { /* your own real transfer fields */ };
}
```

**Two real rules, verified concretely (`matching-contract.test.mjs`)**:

- Include a real, signed `wrapsContractId` field for transparency — but know the *real* security comes from the hardcoded import above, never from that field alone (a field could be spoofed; a real, direct function call cannot be).
- Your own payload must carry everything the wrapped contract needs to independently re-verify its own real outcome (`generous-transfer.js`'s own `verifyPayout` never receives DAG access — only its own payload) — so your composing contract's payload does too, self-contained, never assuming shared state exists somewhere else.

## 7. Test against the real protocol, not a mock of it

Every real security property above was verified end to end against
`progression.js`'s own real `applyProgressionEvent` — real, computed
VDF chains, not simulated ones (see `generous-transfer.test.mjs`'s own
"THE FULL, END-TO-END ANTI-GRINDING PROPERTY" test). A mock that
"looks like" the real protocol can hide exactly the class of bug this
guide exists because of.

## 8. A real checklist, before calling a contract done

- [ ] `CONTRACT_ID` is a real constant, part of every signed commitment's own content.
- [ ] The real source has been published via `contract-registry.js`.
- [ ] Any unpredictability comes from a real, future VDF output — never `Math.random()`, never a timestamp, never anything either party could predict or choose.
- [ ] The outcome depends only on values that genuinely require real, sequential, unshortcuttable work to produce or vary — never a cheaply-variable field.
- [ ] Any real VDF output is independently re-verified, never trusted from an event's own shape.
- [ ] If real AIWA moves, it moves through `verifyPayout` + Conservation — never a separate, invented ledger.
- [ ] `verifyPayout` returns `null` on any single failure — never a partial result.
- [ ] Real, adversarial tests exist for every rule above — not just the success path.
- [ ] If composing with another real contract, its own real outcome is genuinely re-verified by direct import — never trusted from a bare claim, and your own payload is self-contained (no assumed shared state).
