import { READY_SEC, type WorkoutItem } from '../config/workout';
import { formatClock, restUnlockAt, type Phase, type SetRef } from '../engine';

export type PhaseActionId = 'start' | 'startNow' | 'cancel' | 'doneEarly' | 'dismiss';

export interface PhaseAction {
  id: PhaseActionId;
  label: string;
  primary: boolean;
  disabled: boolean;
}

export interface PhaseView {
  /** data-phase value for styling: idle | ready | work | rest | over | complete */
  key: string;
  label: string;
  title: string;
  time: string;
  /** 0..1 progress through the current phase. */
  fraction: number;
  actions: PhaseAction[];
}

export function setLabel(item: WorkoutItem | undefined, set: number): string {
  if (!item) return '';
  if (item.type !== 'lift') return item.name;
  return `${item.name} · Set ${set + 1} of ${item.sets}${item.note ? ` · ${item.note}` : ''}`;
}

/** What the set timer shows for the current phase. Shared by PhaseTimer and GymMode. */
export function phaseView(
  phase: Phase,
  now: number,
  locked: boolean,
  byId: Record<string, WorkoutItem>,
  next: SetRef | null,
): PhaseView {
  const nextItem = next ? byId[next.itemId] : undefined;

  switch (phase.kind) {
    case 'ready': {
      const left = phase.endAt - now;
      return {
        key: 'ready',
        label: 'Get ready',
        title: setLabel(byId[phase.itemId], phase.set),
        time: String(Math.max(0, Math.ceil(left / 1000))),
        fraction: 1 - left / (READY_SEC * 1000),
        actions: [
          { id: 'startNow', label: 'Start now', primary: true, disabled: false },
          { id: 'cancel', label: 'Cancel', primary: false, disabled: false },
        ],
      };
    }
    case 'work': {
      const left = phase.endAt - now;
      return {
        key: 'work',
        label: 'Work',
        title: setLabel(byId[phase.itemId], phase.set),
        time: formatClock(left),
        fraction: (now - phase.startedAt) / (phase.endAt - phase.startedAt),
        actions: [{ id: 'doneEarly', label: 'Done early', primary: true, disabled: false }],
      };
    }
    case 'rest': {
      const left = phase.endAt - now;
      const overtime = left <= 0;
      const skipLabel = overtime
        ? 'Dismiss'
        : locked
          ? `Skip in ${Math.ceil((restUnlockAt(phase) - now) / 1000)}s`
          : 'Skip rest';
      return {
        key: overtime ? 'over' : 'rest',
        label: overtime ? 'Rest over' : 'Rest',
        title: next && nextItem ? `Next: ${setLabel(nextItem, next.set)}` : 'Rest',
        time: overtime ? `+${formatClock(-left, false)}` : formatClock(left),
        fraction: overtime ? 1 : (now - phase.startedAt) / (phase.endAt - phase.startedAt),
        actions: [
          { id: 'start', label: 'Start next set', primary: true, disabled: locked || !next },
          { id: 'dismiss', label: skipLabel, primary: false, disabled: locked },
        ],
      };
    }
    case 'complete':
      return { key: 'complete', label: 'Done', title: 'Workout complete. Nice work.', time: '✓', fraction: 1, actions: [] };
    default:
      return {
        key: 'idle',
        label: 'Up next',
        title: next ? setLabel(nextItem, next.set) : 'Nothing left',
        time: nextItem ? formatClock(nextItem.durationSec * 1000) : '0:00',
        fraction: 0,
        actions: [{ id: 'start', label: 'Start set', primary: true, disabled: !next }],
      };
  }
}
