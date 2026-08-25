// A domain's own progression epoch advances only through a valid
// transition: monotonic (+1 exactly), causally chained to the domain's
// last accepted transition, and carrying a real sequential VDF proof
// (see vdf.js) — bounding the RATE of advancement, not calendar time.

import { vdfSeed, verifyVdfChain } from './vdf.js';

export function initialProgressionState() {
  return { domains: {}, rejections: [] };
}

export async function applyProgressionEvent(state, event) {
  const payload = event.payload;
  if (!payload || payload.type !== 'progression') return state;

  const { domain, epoch, vdfIterations, vdfOutput } = payload;
  const reject = (reason) => ({
    ...state,
    rejections: [...state.rejections, { eventId: event.id, domain, reason }],
  });

  if (typeof domain !== 'string' || domain.length === 0) return reject('missing domain');
  if (!Number.isInteger(epoch) || epoch < 1) return reject('epoch must be a positive integer');

  const current = state.domains[domain] ?? { epoch: 0, lastId: null, vdfOutput: null };

  if (epoch !== current.epoch + 1) return reject(`expected epoch ${current.epoch + 1}, got ${epoch}`);
  if (current.lastId !== null && !event.parents.includes(current.lastId)) {
    return reject(`does not chain from this domain's last accepted transition ${current.lastId}`);
  }
  if (!Number.isInteger(vdfIterations) || vdfIterations < 1) return reject('vdfIterations must be a positive integer');

  const seed = vdfSeed(domain, current.vdfOutput ?? 'genesis');
  if (!(await verifyVdfChain(seed, vdfIterations, vdfOutput))) {
    return reject('VDF proof does not verify against the recomputed chain');
  }

  return { ...state, domains: { ...state.domains, [domain]: { epoch, lastId: event.id, vdfOutput } } };
}

export async function materializeProgression(orderedEvents) {
  let state = initialProgressionState();
  for (const event of orderedEvents) state = await applyProgressionEvent(state, event);
  return state;
}
