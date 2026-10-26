import { useEffect } from 'react';

/** True if the touched element, or the page, is scrolled to the very top. */
function atTop(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight && el.scrollTop > 0) return false;
  }
  return (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
}

/**
 * Guards against accidentally reloading mid-workout:
 * - Blocks pull-to-refresh (a downward drag that starts at the top of the page),
 *   while leaving normal scrolling alone. Always on.
 * - While `active`, asks for confirmation before reload/close where the browser
 *   supports it (Chrome on Android and desktop; iPhone browsers ignore this).
 */
export function useRefreshGuard(active: boolean): void {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let fromTop = false;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      fromTop = atTop(e.target);
    };
    const onMove = (e: TouchEvent) => {
      if (!fromTop || e.touches.length !== 1 || !e.cancelable) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0 && dy > Math.abs(dx)) e.preventDefault();
      else if (dy < 0) fromTop = false; // scrolling down the page: leave it alone
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}
