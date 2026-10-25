/** m:ss (or h:mm:ss) for a non-negative duration in ms, rounding up partial seconds. */
export function formatClock(ms: number, roundUp = true): string {
  const total = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Whole minutes, e.g. "80 min". */
export function formatMinutes(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}
