import { FORM_CUES, GUIDES, TIPS, WATER_LINE, type WorkoutItem } from '../config/workout';
import { indexItems } from './rules';
import { isItemDone, nextSet, type SessionState } from './session';

export type Reminder =
  | { kind: 'rest'; main: string; next: string | null; cue: string | null }
  | { kind: 'guide'; title: string; lines: string[] };

/** What the reminder card should show right now, or null to hide it. */
export function reminderFor(items: WorkoutItem[], state: SessionState): Reminder | null {
  const byId = indexItems(items);
  const p = state.phase;

  if ((p.kind === 'ready' || p.kind === 'work') && byId[p.itemId]?.type !== 'lift') {
    const guide = GUIDES[p.itemId];
    return guide ? { kind: 'guide', title: guide.title, lines: guide.lines } : null;
  }

  if (p.kind !== 'rest') return null;

  const item = byId[p.itemId];
  const next = nextSet(items, state);
  const nextItem = next ? byId[next.itemId] : undefined;

  // Count finished lift sets to rotate the message across rests.
  const n = items
    .filter((i) => i.type === 'lift')
    .reduce((sum, i) => sum + (state.done[i.id] ?? []).filter(Boolean).length, 0);

  let main: string;
  if (isItemDone(state, item.id) && nextItem) {
    main = `${item.name} done. Drink water and set up for ${nextItem.name}.`;
  } else if (n % 2 === 1) {
    main = WATER_LINE;
  } else {
    main = TIPS[(n / 2 - 1 + TIPS.length) % TIPS.length];
  }

  return {
    kind: 'rest',
    main,
    next: next && nextItem ? `Next: ${nextItem.name} set ${next.set + 1}.` : null,
    cue: nextItem ? (FORM_CUES[nextItem.id] ?? null) : null,
  };
}
