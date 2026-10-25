import type { WorkoutItem } from '../config/workout';
import { formatClock, restUnlockAt, type Phase, type SetRef } from '../engine';

interface Props {
  phase: Phase;
  now: number;
  /** In the locked first part of a rest. */
  locked: boolean;
  byId: Record<string, WorkoutItem>;
  next: SetRef | null;
  onStart: () => void;
  onStartNow: () => void;
  onCancel: () => void;
  onDoneEarly: () => void;
  onDismiss: () => void;
}

function setLabel(item: WorkoutItem | undefined, set: number): string {
  if (!item) return '';
  return item.type === 'lift' ? `${item.name} · Set ${set + 1} of ${item.sets}` : item.name;
}

export function PhaseTimer({ phase, now, locked, byId, next, onStart, onStartNow, onCancel, onDoneEarly, onDismiss }: Props) {
  const nextItem = next ? byId[next.itemId] : undefined;
  let label: string;
  let title: string;
  let time: string;
  let fraction = 0;
  let overtime = false;
  let buttons: JSX.Element;

  switch (phase.kind) {
    case 'ready': {
      const left = phase.endAt - now;
      label = 'Get ready';
      title = setLabel(byId[phase.itemId], phase.set);
      time = String(Math.max(0, Math.ceil(left / 1000)));
      fraction = 1 - left / 5000;
      buttons = (
        <>
          <button type="button" className="btn btn--primary" onClick={onStartNow}>
            Start now
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </>
      );
      break;
    }
    case 'work': {
      const left = phase.endAt - now;
      label = 'Work';
      title = setLabel(byId[phase.itemId], phase.set);
      time = formatClock(left);
      fraction = (now - phase.startedAt) / (phase.endAt - phase.startedAt);
      buttons = (
        <button type="button" className="btn btn--primary" onClick={onDoneEarly}>
          Done early
        </button>
      );
      break;
    }
    case 'rest': {
      const left = phase.endAt - now;
      overtime = left <= 0;
      label = overtime ? 'Rest over' : 'Rest';
      title = next && nextItem ? `Next: ${setLabel(nextItem, next.set)}` : 'Rest';
      time = overtime ? `+${formatClock(-left, false)}` : formatClock(left);
      fraction = overtime ? 1 : (now - phase.startedAt) / (phase.endAt - phase.startedAt);
      buttons = (
        <>
          <button type="button" className="btn btn--primary" onClick={onStart} disabled={locked || !next}>
            Start next set
          </button>
          <button type="button" className="btn" onClick={onDismiss} disabled={locked}>
            {overtime ? 'Dismiss' : locked ? `Skip in ${Math.ceil((restUnlockAt(phase) - now) / 1000)}s` : 'Skip rest'}
          </button>
        </>
      );
      break;
    }
    case 'complete':
      label = 'Done';
      title = 'Workout complete. Nice work.';
      time = '✓';
      fraction = 1;
      buttons = <></>;
      break;
    default:
      label = 'Up next';
      title = next ? setLabel(nextItem, next.set) : 'Nothing left';
      time = nextItem ? formatClock(nextItem.durationSec * 1000) : '0:00';
      buttons = (
        <button type="button" className="btn btn--primary" onClick={onStart} disabled={!next}>
          Start set
        </button>
      );
  }

  const phaseKey = phase.kind === 'rest' && overtime ? 'over' : phase.kind;

  return (
    <section className="timer" data-phase={phaseKey} aria-label="Set timer">
      <div className="timer__top">
        <span className="timer__label">{label}</span>
        <span className="timer__title">{title}</span>
      </div>
      <div className="timer__time num" role="timer" aria-live="off">
        {time}
      </div>
      <div className="timer__bar" aria-hidden="true">
        <div className="timer__barfill" style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }} />
      </div>
      <div className="timer__buttons">{buttons}</div>
    </section>
  );
}
