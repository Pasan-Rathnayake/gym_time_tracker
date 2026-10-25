import { useEffect, useState } from 'react';
import type { Toast as T } from '../engine';

/** Shows each new toast (by id) for a few seconds. Ignores the one present on mount. */
export function Toast({ toast }: { toast: T | null }) {
  const [initialId] = useState(() => toast?.id ?? 0);
  const [visible, setVisible] = useState<T | null>(null);

  useEffect(() => {
    if (!toast || toast.id <= initialId) return;
    setVisible(toast);
    const t = window.setTimeout(() => setVisible(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast, initialId]);

  return (
    <div className="toast-wrap" role="status" aria-live="assertive">
      {visible && (
        <div key={visible.id} className="toast">
          {visible.text}
        </div>
      )}
    </div>
  );
}
