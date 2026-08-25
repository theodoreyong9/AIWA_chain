// r(b, q, qTotal, T) = (b * q^alpha) / [ln(qTotal^(beta*(1-T)) + C)]^gamma
//
// qTotal is this domain's OWN progression epoch count, never a value
// shared across domains — requiring a shared reference would
// reintroduce cross-domain synchronization, which this system is
// built to avoid.

export class RewardError extends Error {}

export function reward(b, q, qTotal, patienceRate, { alpha, beta, gamma, C, minQ }) {
  if (!Number.isFinite(b) || b < 0) throw new RewardError(`b must be >= 0, got ${b}`);
  if (!Number.isFinite(q) || q < 0) throw new RewardError(`q must be >= 0, got ${q}`);
  if (!Number.isFinite(qTotal) || qTotal < 0) throw new RewardError(`qTotal must be >= 0, got ${qTotal}`);
  if (![alpha, beta, gamma, C, minQ].every(Number.isFinite)) {
    throw new RewardError('alpha, beta, gamma, C, minQ must all be finite');
  }

  if (q < minQ) return 0;

  const T = Math.min(Math.max(patienceRate, 0), 0.4);
  const effQ = Math.max(1, q);
  const effQTotal = Math.max(1, qTotal);

  const numerator = effQ ** alpha * b;
  const inner = effQTotal ** (beta * (1 - T)) + C;
  if (inner <= 1) return 0;

  const denominator = Math.log(inner) ** gamma;
  if (!(denominator > 0) || !Number.isFinite(denominator) || !Number.isFinite(numerator)) return 0;

  const r = numerator / denominator;
  return (r < 0 || !Number.isFinite(r) || r > 1e12) ? 0 : r;
}

export function elapsedEpochs(progressionState, domain, q0) {
  const currentEpoch = progressionState.domains[domain]?.epoch ?? 0;
  return Math.max(0, currentEpoch - q0);
}

export function domainAge(progressionState, domain) {
  return progressionState.domains[domain]?.epoch ?? 0;
}
