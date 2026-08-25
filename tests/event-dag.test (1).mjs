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

test('loadTrusted reconstructs the identical DAG a real addEvent-based replay would', async () => {
  const original = new EventDag();
  let lastId = null;
  for (let i = 0; i < 20; i++) {
    lastId = await original.addEvent(lastId ? [lastId] : [], { type: 'x', i });
  }
  const restored = new EventDag();
  restored.loadTrusted(original.topoOrder());
  assert.deepEqual(restored.topoOrder().map((e) => e.id), original.topoOrder().map((e) => e.id));
  assert.equal(restored.size, original.size);
});

test('loadTrusted is idempotent and safe to call more than once', async () => {
  const original = new EventDag();
  const id = await original.addEvent([], { type: 'x' });
  const restored = new EventDag();
  restored.loadTrusted(original.topoOrder());
  restored.loadTrusted(original.topoOrder());
  assert.equal(restored.size, 1);
});

test('loadTrusted skips an event whose parent is not present, rather than throwing', () => {
  const dag = new EventDag();
  dag.loadTrusted([{ id: 'orphan', parents: ['ghost-parent'], payload: { type: 'x' } }]);
  assert.equal(dag.size, 0);
});

test('THE REAL PROPERTY: loadTrusted is real, measurably faster than a full addEvent replay for a real, larger history', async () => {
  const original = new EventDag();
  let lastId = null;
  for (let i = 0; i < 500; i++) {
    lastId = await original.addEvent(lastId ? [lastId] : [], { type: 'progression', epoch: i });
  }
  const events = original.topoOrder();

  const slowStart = performance.now();
  const slowReplay = new EventDag();
  for (const ev of events) await slowReplay.addEvent(ev.parents, ev.payload);
  const slowTime = performance.now() - slowStart;

  const fastStart = performance.now();
  const fastReplay = new EventDag();
  fastReplay.loadTrusted(events);
  const fastTime = performance.now() - fastStart;

  assert.equal(fastReplay.size, slowReplay.size);
  assert.ok(fastTime < slowTime / 3, `loadTrusted should be substantially faster: fast=${fastTime.toFixed(1)}ms slow=${slowTime.toFixed(1)}ms`);
});

test('SECURITY, THE REAL DOCUMENTED LIMIT: unlike addEvent, loadTrusted does not detect a tampered payload whose stored id no longer matches its content', () => {
  // This is the real, accepted trade-off loadTrusted makes — it is
  // safe ONLY for a domain's own already-once-verified local storage,
  // never for genuinely external, untrusted input (that case must
  // keep using addEvent's own real recomputation). This test pins that
  // limit down concretely rather than leaving it as an unverified claim
  // in a comment.
  const dag = new EventDag();
  dag.loadTrusted([{ id: 'claims-to-be-x-but-is-not', parents: [], payload: { type: 'actually-something-else' } }]);
  assert.equal(dag.size, 1, 'loadTrusted accepts the mismatched id/content pair — real, by design, for this specific trusted-storage use case only');
});
