// Composes progression.js and reward.js into a real position per
// domain: committed capital b, and the epoch of the domain's own last
// action (an accrual or a claim) — never a caller-supplied value,
// always derived from the domain's own real, independently folded
// progression, exactly the "recompute, don't trust" discipline this
// project applies everywhere else. A caller providing its own
// reference epoch would let anyone claim t=currentEpoch forever.
//
// t (time since the last action) resets on every accrual or claim —
// the reward formula rewards patience since you last touched your own
// position, not since genesis. A (domainAge, the denominator
// reference) never resets — it is the domain's own total progression,
// regardless of how often it claims.
//
// 'accrual': { domain, b } — commits additional capital, adds to any
// already-committed b, resets the patience clock.
// 'claim': { domain, amount, T } — computes what is currently
// claimable from the real position, debits up to that amount into a
// real bigint balance, resets the patience clock.

import { applyProgressionEvent, initialProgressionState } from './progression.js';
import { reward, domainAge } from './reward.js';
import { toUnits, fromFloat } from './units.js';

export function initialAccrualState() {
  return { progression: initialProgressionState(), positions: {}, balances: {}, rejections: [] };
}

function currentlyClaimable(rewardParams, state, domain) {
  const position = state.positions[domain];
  if (!position) return 0;
  const currentEpoch = domainAge(state.progression, domain);
  const t = Math.max(0, currentEpoch - position.lastActionEpoch);
  return reward(position.b, t, currentEpoch, position.T ?? 0, rewardParams);
}

export async function applyAccrualEvent(rewardParams, state, event) {
  const payload = event.payload;
  if (!payload || typeof payload.type !== 'string') return state;

  if (payload.type === 'progression') {
    return { ...state, progression: await applyProgressionEvent(state.progression, event) };
  }

  if (payload.type === 'accrual') {
    const { domain, b, T } = payload;
    const reject = (reason) => ({ ...state, rejections: [...state.rejections, { eventId: event.id, domain: domain ?? null, reason }] });
    if (typeof domain !== 'string' || !domain) return reject('missing domain');
    if (!Number.isFinite(b) || b < 0) return reject('b must be a finite number >= 0');

    const currentEpoch = domainAge(state.progression, domain);
    const prior = state.positions[domain] ?? { b: 0, lastActionEpoch: currentEpoch, T: 0 };
    return { ...state, positions: { ...state.positions, [domain]: { b: prior.b + b, lastActionEpoch: currentEpoch, T: T ?? prior.T } } };
  }

  if (payload.type === 'claim') {
    const { domain } = payload;
    const reject = (reason) => ({ ...state, rejections: [...state.rejections, { eventId: event.id, domain: domain ?? null, reason }] });
    if (typeof domain !== 'string' || !domain) return reject('missing domain');
    if (!state.positions[domain]) return reject('no committed capital for this domain');

    const claimableFloat = currentlyClaimable(rewardParams, state, domain);
    const claimableUnits = claimableFloat > 0 ? fromFloat(claimableFloat) : 0n;

    let amount;
    try {
      amount = toUnits(payload.amount);
    } catch {
      return reject('malformed amount');
    }
    if (!(amount > 0n)) return reject('amount must be positive');
    if (amount > claimableUnits) return reject(`insufficient claimable: has ${claimableUnits}, tried to claim ${amount}`);

    const currentEpoch = domainAge(state.progression, domain);
    const currentBalance = state.balances[domain] ?? 0n;
    return {
      ...state,
      positions: { ...state.positions, [domain]: { ...state.positions[domain], lastActionEpoch: currentEpoch } },
      balances: { ...state.balances, [domain]: currentBalance + amount },
    };
  }

  return state;
}

export async function materializeAccrual(rewardParams, orderedEvents) {
  let state = initialAccrualState();
  for (const event of orderedEvents) state = await applyAccrualEvent(rewardParams, state, event);
  return state;
}

export function claimableNow(rewardParams, state, domain) {
  const floatValue = currentlyClaimable(rewardParams, state, domain);
  return floatValue > 0 ? fromFloat(floatValue) : 0n;
}
