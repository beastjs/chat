/** Keep adapter windows bounded even when a host supplies an invalid page size. */
export function normalizeMessageLimit(value: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 50
}
