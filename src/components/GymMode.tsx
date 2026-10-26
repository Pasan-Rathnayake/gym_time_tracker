import { useEffect, useRef } from 'react';
import { formatClock, type Reminder } from '../engine';
import type { WakeLockStatus } from '../hooks/useWakeLock';
import type { PhaseActionId, PhaseView } from './phaseView';

interface Props {
  view: PhaseView;
  onAction: (id: PhaseActionId) => void;
  onExit: () => void;
  done: number;
  total: number;
  timeLeftMs: number;
  workoutMs: number;
  reminder: Reminder | null;
  wake: WakeLockStatus;
}

const WAKE_TEXT: Record<WakeLockStatus, string> = {
  native: 'Screen stays on',
  video: 'Screen kept on (fallback). If it still dims, set Auto-Lock to Never.',
  none: "This browser can't keep the screen on. Set Settings › Display & Brightness › Auto-Lock to Never.",
  off: '',
};

/** Full-screen, dark, glanceable timer for use mid-workout. */
export function GymMode({ view, onAction, onExit, done, total, timeLeftMs, workoutMs, reminder, wake }: Props) {
  const exitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    exitRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onExit]);

  const line =
    reminder?.kind === 'rest' ? reminder.main : reminder?.kind === 'guide' ? reminder.lines.join(' · ') : null;
  const cue = reminder?.kind === 'rest' ? reminder.cue : null;

  return (
    <div className="gym" data-phase={view.key} role="dialog" aria-modal="true" aria-label="Gym mode">
      <div className="gym__top">
        <dl className="gym__stats">
          <div>
            <dt>Steps</dt>
            <dd className="num">
              {done}/{total}
            </dd>
          </div>
          <div>
            <dt>Left</dt>
            <dd className="num">{formatClock(timeLeftMs)}</dd>
          </div>
          <div>
            <dt>Workout</dt>
            <dd className="num">{formatClock(workoutMs, false)}</dd>
          </div>
        </dl>
        <button ref={exitRef} type="button" className="gym__exit" onClick={onExit} aria-label="Exit gym mode">
          ✕
        </button>
      </div>

      <div className="gym__main">
        <p className="gym__label">{view.label}</p>
        <p className="gym__title">{view.title}</p>
        <div className="gym__time num" role="timer" aria-live="off">
          {view.time}
        </div>
        <div className="gym__bar" aria-hidden="true">
          <div className="gym__barfill" style={{ width: `${Math.min(100, Math.max(0, view.fraction * 100))}%` }} />
        </div>
        {line && (
          <div className="gym__reminder" aria-live="polite">
            <p>{line}</p>
            {cue && <p className="gym__cue">{cue}</p>}
          </div>
        )}
      </div>

      <div className="gym__actions">
        {view.actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`gym__btn${a.primary ? ' gym__btn--primary' : ''}`}
            disabled={a.disabled}
            onClick={() => onAction(a.id)}
          >
            {a.label}
          </button>
        ))}
        {wake !== 'off' && <p className={`gym__wake gym__wake--${wake}`}>{WAKE_TEXT[wake]}</p>}
      </div>
    </div>
  );
}
