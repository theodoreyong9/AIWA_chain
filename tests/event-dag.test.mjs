import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventDag } from '../public/core/event-dag.js';

test('addEvent is idempotent — re-adding a known event is a no-op', async () => {
  const dag = new EventDag();
  const id1 = await dag.addEvent([], { type: 'x' });
  const id2 = await dag.addEvent([], { type: 'x' });
  assert.equal(id1, id2);
  assert.equal(dag.size, 1);
});

test('addEvent rejects an unknown parent', async () => {
  const dag = new EventDag();
  await assert.rejects(dag.addEvent(['ghost'], { type: 'x' }), /Unknown parent/);
});

test('topoOrder sorts parents before children', async () => {
  const dag = new EventDag();
  const a = await dag.addEvent([], { type: 'a' });
  const b = await dag.addEvent([a], { type: 'b' });
  const c = await dag.addEvent([b], { type: 'c' });
  const order = dag.topoOrder().map((e) => e.payload.type);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('a DAG with branching and merging parents sorts correctly', async () => {
  const dag = new EventDag();
  const a = await dag.addEvent([], { type: 'a' });
  const b = await dag.addEvent([a], { type: 'b' });
  const c = await dag.addEvent([a], { type: 'c' });
  const d = await dag.addEvent([b, c], { type: 'd' });
  const order = dag.topoOrder().map((e) => e.payload.type);
  assert.equal(order[0], 'a');
  assert.equal(order[order.length - 1], 'd');
  assert.equal(order.length, 4);
});

test('merge is a real, commutative union — two DAGs converge regardless of order', async () => {
  const dagA = new EventDag();
  const dagB = new EventDag();
  const genesis = await dagA.addEvent([], { type: 'genesis' });
  await dagB.addEvent([], { type: 'genesis' }); // same content, same id
  await dagA.addEvent([genesis], { type: 'a-only' });
  await dagB.addEvent([genesis], { type: 'b-only' });

  dagA.merge(dagB);
  dagB.merge(dagA);

  assert.equal(dagA.size, dagB.size);
  assert.deepEqual(
    dagA.topoOrder().map((e) => e.id).sort(),
    dagB.topoOrder().map((e) => e.id).sort(),
  );
});

test('subscribe fires only for genuinely new events, not idempotent re-adds', async () => {
  const dag = new EventDag();
  let fired = 0;
  dag.subscribe(() => { fired++; });
  const id = await dag.addEvent([], { type: 'x' });
  await dag.addEvent([], { type: 'x' }); // same id again
  assert.equal(fired, 1);
});

test('materialize folds a reducer over the real topological order', async () => {
  const dag = new EventDag();
  await dag.addEvent([], { type: 'add', n: 1 });
  const second = await dag.addEvent([[...dag.topoOrder()][0].id], { type: 'add', n: 2 });
  const total = dag.materialize((sum, ev) => sum + ev.payload.n, 0);
  assert.equal(total, 3);
});
