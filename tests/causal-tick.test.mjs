import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { deriveDomainId } from '../public/core/domain-id.js';
import { initialMirrorState, applyMirrorEvent } from '../public/core/mirror.js';
import { initialIdentityCostState, registerIdentityCost } from '../public/core/identity-cost.js';
import { computeCausalTick, checkCausalConsistency } from '../public/core/causal-tick.js';

function makeSigner() {
  const seed = ed25519.utils.randomSecretKey();
  const pubkeyBytes = ed25519.getPublicKey(seed);
  return { seed, pubkeyBytes };
}
function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function canonicalMessage({ domain, epoch, kind, receivedFrom }) {
  const sorted = [...receivedFrom].sort((a, b) => (a.sourceDomain + a.eventId).localeCompare(b.sourceDomain + b.eventId));
  return JSON.stringify({ domain, epoch, kind, receivedFrom: sorted });
}
async function signCommitment(signer, fields) {
  const message = new TextEncoder().encode(canonicalMessage(fields));
  const signature = ed25519.sign(message, signer.seed);
  return { ...fields, signature: toHex(signature), signerPubkey: toHex(signer.pubkeyBytes) };
}
function fundedIdentityCost(state, domain, lamports) {
  const result = registerIdentityCost(state, { domain, tx: { signature: `sig-${domain}`, err: null, incineratorBalanceDeltaLamports: lamports, commitment: 'finalized', slot: 1 } });
  return result.state;
}

function deriveSourceEpochLookupOverride(orderedEvents) {
  return (sourceDomain, eventId) => {
    const ev = orderedEvents.find((e) => e.id === eventId);
    return ev && ev.payload.domain === sourceDomain ? ev.payload.epoch : null;
  };
}

test('a domain with no external observers has no causal tick — a real, honest absence (bottom)', async () => {
  const result = await computeCausalTick(initialMirrorState(), initialIdentityCostState(), [], 'ghost');
  assert.equal(result, null);
});

test('a single, real, funded observer produces a real causal tick matching what it observed', async () => {
  const signer = makeSigner();
  const observerDomain = await deriveDomainId(signer.pubkeyBytes);
  const targetEvent = { id: 'e5', parents: [], payload: { type: 'progression', domain: 'target', epoch: 5 } };
  let identityCostState = fundedIdentityCost(initialIdentityCostState(), observerDomain, 1000);
  const payload = await signCommitment(signer, { domain: observerDomain, epoch: 1, kind: 'full', receivedFrom: [{ sourceDomain: 'target', eventId: 'e5' }] });
  const mirrorState = await applyMirrorEvent(initialMirrorState(), { id: 'm1', payload: { type: 'reception', ...payload } }, deriveSourceEpochLookupOverride([targetEvent]));

  const result = await computeCausalTick(mirrorState, identityCostState, [targetEvent], 'target');
  assert.equal(result.tick, 5);
  assert.equal(result.totalWeight, 1000);
});

test('SECURITY: an observer with zero real burn contributes zero weight, even with a real, validly-signed commitment', async () => {
  const signer = makeSigner();
  const observerDomain = await deriveDomainId(signer.pubkeyBytes);
  const targetEvent = { id: 'e5', parents: [], payload: { type: 'progression', domain: 'target', epoch: 5 } };
  // Deliberately never registering identity-cost for this observer — zero real weight.
  const identityCostState = initialIdentityCostState();
  const payload = await signCommitment(signer, { domain: observerDomain, epoch: 1, kind: 'full', receivedFrom: [{ sourceDomain: 'target', eventId: 'e5' }] });
  const mirrorState = await applyMirrorEvent(initialMirrorState(), { id: 'm1', payload: { type: 'reception', ...payload } }, deriveSourceEpochLookupOverride([targetEvent]));

  const result = await computeCausalTick(mirrorState, identityCostState, [targetEvent], 'target');
  assert.equal(result, null, 'a real signature with zero real committed capital must contribute nothing');
});

test('SECURITY: real majority weight determines the tick even against a funded but minority adversary', async () => {
  const targetEvent = { id: 'e100', parents: [], payload: { type: 'progression', domain: 'target', epoch: 100 } };
  const fakeTargetEvent = { id: 'e-fake-999', parents: [], payload: { type: 'progression', domain: 'target', epoch: 999999 } };
  const orderedEvents = [targetEvent, fakeTargetEvent];

  let mirrorState = initialMirrorState();
  let identityCostState = initialIdentityCostState();
  const lookup = deriveSourceEpochLookupOverride(orderedEvents);

  // Three real, honest, well-funded observers agreeing on epoch 100.
  for (let i = 0; i < 3; i++) {
    const signer = makeSigner();
    const domain = await deriveDomainId(signer.pubkeyBytes);
    identityCostState = fundedIdentityCost(identityCostState, domain, 10000);
    const payload = await signCommitment(signer, { domain, epoch: 1, kind: 'full', receivedFrom: [{ sourceDomain: 'target', eventId: 'e100' }] });
    mirrorState = await applyMirrorEvent(mirrorState, { id: `m-honest-${i}`, payload: { type: 'reception', ...payload } }, lookup);
  }
  // One adversarial observer, funded, but a real minority of total weight (9999 vs 30000 honest).
  const attacker = makeSigner();
  const attackerDomain = await deriveDomainId(attacker.pubkeyBytes);
  identityCostState = fundedIdentityCost(identityCostState, attackerDomain, 9999);
  const attackPayload = await signCommitment(attacker, { domain: attackerDomain, epoch: 1, kind: 'full', receivedFrom: [{ sourceDomain: 'target', eventId: 'e-fake-999' }] });
  mirrorState = await applyMirrorEvent(mirrorState, { id: 'm-attacker', payload: { type: 'reception', ...attackPayload } }, lookup);

  const result = await computeCausalTick(mirrorState, identityCostState, orderedEvents, 'target');
  assert.equal(result.tick, 100, `real honest majority weight must win — got ${result.tick}`);
});

test('checkCausalConsistency is trivially consistent with no evidence yet', () => {
  const { consistent, gap } = checkCausalConsistency(500, null, 5);
  assert.equal(consistent, true);
  assert.equal(gap, null);
});

test('checkCausalConsistency flags a real, large gap between self-reported and corroborated epoch', () => {
  const { consistent, gap } = checkCausalConsistency(500, { tick: 10 }, 5);
  assert.equal(consistent, false);
  assert.equal(gap, 490);
});

test('checkCausalConsistency accepts a self-reported epoch within real tolerance', () => {
  const { consistent } = checkCausalConsistency(12, { tick: 10 }, 5);
  assert.equal(consistent, true);
});

test('computeCausalTick reports a real interval, not just a point — spread across disagreeing observers', async () => {
  const targetEvent98 = { id: 'e98', parents: [], payload: { type: 'progression', domain: 'target', epoch: 98 } };
  const targetEvent102 = { id: 'e102', parents: [], payload: { type: 'progression', domain: 'target', epoch: 102 } };
  const orderedEvents = [targetEvent98, targetEvent102];
  const lookup = deriveSourceEpochLookupOverride(orderedEvents);

  let mirrorState = initialMirrorState();
  let identityCostState = initialIdentityCostState();
  const signerA = makeSigner();
  const domainA = await deriveDomainId(signerA.pubkeyBytes);
  identityCostState = fundedIdentityCost(identityCostState, domainA, 1000);
  const payloadA = await signCommitment(signerA, { domain: domainA, epoch: 1, kind: 'full', receivedFrom: [{ sourceDomain: 'target', eventId: 'e98' }] });
  mirrorState = await applyMirrorEvent(mirrorState, { id: 'mA', payload: { type: 'reception', ...payloadA } }, lookup);

  const signerB = makeSigner();
  const domainB = await deriveDomainId(signerB.pubkeyBytes);
  identityCostState = fundedIdentityCost(identityCostState, domainB, 1000);
  const payloadB = await signCommitment(signerB, { domain: domainB, epoch: 1, kind: 'full', receivedFrom: [{ sourceDomain: 'target', eventId: 'e102' }] });
  mirrorState = await applyMirrorEvent(mirrorState, { id: 'mB', payload: { type: 'reception', ...payloadB } }, lookup);

  const result = await computeCausalTick(mirrorState, identityCostState, orderedEvents, 'target');
  assert.deepEqual(result.interval, [98, 102]);
});

test('HARDWARE IS OPTIONAL: computeCausalTick produces the identical tick with or without hardware attestation data', async () => {
  const signer = makeSigner();
  const observerDomain = await deriveDomainId(signer.pubkeyBytes);
  const targetEvent = { id: 'e5', parents: [], payload: { type: 'progression', domain: 'target', epoch: 5 } };
  const identityCostState = fundedIdentityCost(initialIdentityCostState(), observerDomain, 1000);
  const payload = await signCommitment(signer, { domain: observerDomain, epoch: 1, kind: 'full', receivedFrom: [{ sourceDomain: 'target', eventId: 'e5' }] });
  const mirrorState = await applyMirrorEvent(initialMirrorState(), { id: 'm1', payload: { type: 'reception', ...payload } }, deriveSourceEpochLookupOverride([targetEvent]));

  const withoutHardware = await computeCausalTick(mirrorState, identityCostState, [targetEvent], 'target');
  const withHardware = await computeCausalTick(mirrorState, identityCostState, [targetEvent], 'target', {});
  assert.equal(withoutHardware.tick, withHardware.tick, 'hardware data (or its absence) must never change the tick itself');
  assert.equal(withoutHardware.hardwareBackedWeight, 0);
});

test('HARDWARE IS AN OPTIONAL SIGNAL, NEVER A WEIGHT: a hardware-backed observer with the same burn contributes the identical weight as one without', async () => {
  const { issueHardwareRoot, bindHardwareRoot } = await import('../public/core/hardware-attestation.js');
  function makeKeypair() {
    const s = makeSigner();
    return { secretKey: new Uint8Array([...s.seed, ...s.pubkeyBytes]), publicKey: { toBytes: () => s.pubkeyBytes } };
  }

  const targetEvent = { id: 'e5', parents: [], payload: { type: 'progression', domain: 'target', epoch: 5 } };
  const lookup = deriveSourceEpochLookupOverride([targetEvent]);

  const signerA = makeSigner(); // no hardware
  const domainA = await deriveDomainId(signerA.pubkeyBytes);
  const signerB = makeSigner(); // will be hardware-backed
  const domainB = await deriveDomainId(signerB.pubkeyBytes);

  let identityCostState = fundedIdentityCost(initialIdentityCostState(), domainA, 1000);
  identityCostState = fundedIdentityCost(identityCostState, domainB, 1000); // identical real weight

  let mirrorState = initialMirrorState();
  const payloadA = await signCommitment(signerA, { domain: domainA, epoch: 1, kind: 'full', receivedFrom: [{ sourceDomain: 'target', eventId: 'e5' }] });
  mirrorState = await applyMirrorEvent(mirrorState, { id: 'mA', payload: { type: 'reception', ...payloadA } }, lookup);
  const payloadB = await signCommitment(signerB, { domain: domainB, epoch: 1, kind: 'full', receivedFrom: [{ sourceDomain: 'target', eventId: 'e5' }] });
  mirrorState = await applyMirrorEvent(mirrorState, { id: 'mB', payload: { type: 'reception', ...payloadB } }, lookup);

  const origin = makeKeypair();
  const originDomain = await deriveDomainId(origin.publicKey.toBytes());
  async function realAttestation(target) {
    const root = makeSigner();
    const issuance = await issueHardwareRoot(origin, originDomain, root.pubkeyBytes);
    const binding = await bindHardwareRoot(root.seed, root.pubkeyBytes, target);
    return { issuance, binding };
  }
  const hardwareAttestations = { [domainB]: [await realAttestation(domainB), await realAttestation(domainB)] };

  const result = await computeCausalTick(mirrorState, identityCostState, [targetEvent], 'target', hardwareAttestations);
  assert.equal(result.totalWeight, 2000, 'both observers contribute the identical, real burn-based weight regardless of hardware');
  assert.equal(result.hardwareBackedWeight, 1000, 'only the real, hardware-attested observer is reported as hardware-backed');
  assert.equal(result.hardwareBackedObservers, 1);
});
