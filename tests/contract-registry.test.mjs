import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EventDag } from '../public/core/event-dag.js';
import { computeContractHash, publishContractSpec, verifyContractSource, readContractSource } from '../public/core/contract-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const realGenerousTransferSource = readFileSync(path.join(__dirname, '../public/core/generous-transfer.js'), 'utf-8');

test('the identical real source always produces the identical real hash', async () => {
  const h1 = await computeContractHash('const x = 1;');
  const h2 = await computeContractHash('const x = 1;');
  assert.equal(h1, h2);
});

test('a real, single-character difference in source produces a genuinely different real hash', async () => {
  const h1 = await computeContractHash('const x = 1;');
  const h2 = await computeContractHash('const x = 2;');
  assert.notEqual(h1, h2);
});

test('THE REAL PUBLISHING PROPERTY: a real contract, published against a real DAG, gets a real, content-addressed event id', async () => {
  const dag = new EventDag();
  const { specEventId, sourceHash } = await publishContractSpec(dag, {
    name: 'generous-transfer', version: 1, sourceCode: realGenerousTransferSource, description: 'deterministic, never chance',
  });
  assert.ok(specEventId, 'a real event id must be produced');
  assert.equal(sourceHash, await computeContractHash(realGenerousTransferSource));
});

test('THE REAL VERIFICATION PROPERTY: a real, correctly-matching source verifies against the real, already-published spec', async () => {
  const dag = new EventDag();
  await publishContractSpec(dag, { name: 'generous-transfer', version: 1, sourceCode: realGenerousTransferSource, description: '' });
  const specEvent = dag.topoOrder()[0];
  assert.equal(await verifyContractSource(specEvent, realGenerousTransferSource), true);
});

test('SECURITY: source that has been altered by even one real character fails verification against the real, already-published spec', async () => {
  const dag = new EventDag();
  await publishContractSpec(dag, { name: 'generous-transfer', version: 1, sourceCode: realGenerousTransferSource, description: '' });
  const specEvent = dag.topoOrder()[0];
  const tampered = realGenerousTransferSource + '\n// a real, added line, never in the original';
  assert.equal(await verifyContractSource(specEvent, tampered), false);
});

test('SECURITY: verification of a non-contract-spec event is refused outright', async () => {
  const dag = new EventDag();
  await dag.addEvent([], { type: 'genesis' });
  const otherEvent = dag.topoOrder()[0];
  assert.equal(await verifyContractSource(otherEvent, 'anything'), false);
});

test('THE REAL RETRIEVAL PROPERTY: the actual source code is genuinely recoverable from an already-published event, never just its fingerprint', async () => {
  const dag = new EventDag();
  await publishContractSpec(dag, { name: 'generous-transfer', version: 1, sourceCode: realGenerousTransferSource, description: '' });
  const specEvent = dag.topoOrder()[0];
  const recovered = readContractSource(specEvent);
  assert.equal(recovered, realGenerousTransferSource, 'the exact, real, complete source must come back unchanged');
});

test('readContractSource returns null, never throws, for a non-contract-spec event', () => {
  const notASpec = { payload: { type: 'genesis' } };
  assert.equal(readContractSource(notASpec), null);
});
