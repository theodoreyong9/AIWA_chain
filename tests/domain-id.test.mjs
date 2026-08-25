import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveDomainId, shortLabel } from '../public/core/domain-id.js';

test('deriveDomainId is deterministic', async () => {
  const key = new Uint8Array(32).fill(7);
  const id1 = await deriveDomainId(key);
  const id2 = await deriveDomainId(key);
  assert.equal(id1, id2);
});

test('deriveDomainId is the full 64-char SHA-256 hex, not truncated', async () => {
  const id = await deriveDomainId(new Uint8Array(32).fill(1));
  assert.equal(id.length, 64);
  assert.match(id, /^[0-9a-f]{64}$/);
});

test('deriveDomainId differs for different keys', async () => {
  const idA = await deriveDomainId(new Uint8Array(32).fill(1));
  const idB = await deriveDomainId(new Uint8Array(32).fill(2));
  assert.notEqual(idA, idB);
});

test('shortLabel truncates for display only', async () => {
  const id = await deriveDomainId(new Uint8Array(32).fill(1));
  assert.equal(shortLabel(id).length, 12);
  assert.equal(shortLabel(id), id.slice(0, 12));
});
