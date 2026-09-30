/**
 * Helpers shared by the probe runners. Small on purpose: what matters is that
 * `swarm` and `mesh-swarm` report percentiles the same way, since comparing
 * their numbers is the reason both exist.
 */

/**
 * p-th percentile of an already-sorted array.
 *
 * The caller sorts; this does not. `NaN` for an empty sample, so an absent
 * measurement is never reported as a real `0`.
 */
export function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
