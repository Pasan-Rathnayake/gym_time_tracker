import { useEffect, useState } from 'react';

/**
 * Returns Date.now(), refreshed every `intervalMs` while `active`, and whenever
 * the tab becomes visible again. Timers derive their display from timestamps,
 * so a missed tick never causes drift.
 */
export function useTicker(active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    const id = active ? window.setInterval(update, intervalMs) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      if (id) window.clearInterval(id);
    };
  }, [active, intervalMs]);

  return now;
}
