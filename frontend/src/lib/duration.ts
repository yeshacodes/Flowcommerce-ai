/**
 * Format a duration given in milliseconds into a compact, human-friendly string.
 *
 * Why these units: raw values like "725.28s" are hard to read and imply orders
 * take many minutes. We scale the unit to the magnitude so the number stays
 * small and legible:
 *   - sub-second  → milliseconds, integer            842      -> "842 ms"
 *   - seconds     → seconds with 2 decimals          2140     -> "2.14 s"
 *   - a minute+   → minutes and whole seconds        72123    -> "1m 12s"
 *
 * Returns "—" when there is no data (null/undefined/NaN), e.g. before any order
 * has been confirmed.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—'

  if (ms < 1000) return `${Math.round(ms)} ms`

  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(2)} s`

  const minutes = Math.floor(seconds / 60)
  // floor (not round) the remaining seconds so 119.9s never renders as "1m 60s"
  const remSeconds = Math.floor(seconds % 60)
  return `${minutes}m ${remSeconds}s`
}
