import type { WorkoutItem } from '../config/workout';

export type PlanId = 1 | 2 | 3;

export interface RestPlan {
  id: PlanId;
  /** Short label, one entry per line on the picker button. */
  lines: string[];
  detail: string;
}

export const REST_PLANS: RestPlan[] = [
  { id: 1, lines: ['2 min', 'every set'], detail: '2 min every set' },
  { id: 2, lines: ['1 min sets', '2 min exercises'], detail: '1 min between sets, 2 min between exercises' },
  { id: 3, lines: ['2 min compound', '1 min iso'], detail: '2 min after compound lifts, 1 min after isolation moves, 2 min between exercises' },
];

export const MIN = 60_000;

/** A single set in the queue: which item and which (0-based) set index. */
export interface SetRef {
  itemId: string;
  set: number;
}

/**
 * Rest in ms after finishing a set of `item`, when the next set to do belongs
 * to `next`. Only lift → lift transitions get a rest; timed blocks, the last
 * lift before the cool-down and the very last set get none.
 */
export function restAfter(plan: PlanId, item: WorkoutItem, next: WorkoutItem | undefined): number {
  if (item.type !== 'lift' || !next || next.type !== 'lift') return 0;
  const sameExercise = next.id === item.id;
  switch (plan) {
    case 1:
      return 2 * MIN;
    case 2:
      return sameExercise ? 1 * MIN : 2 * MIN;
    case 3:
      if (!sameExercise) return 2 * MIN;
      return item.isPress ? 2 * MIN : 1 * MIN;
  }
}

/** Rest between two sets of the same exercise, for display on the card. */
export function restBetweenSets(plan: PlanId, item: WorkoutItem): number {
  return restAfter(plan, item, item);
}

/** Expands items in queue order into a flat list of sets. */
export function expandSets(items: WorkoutItem[]): SetRef[] {
  const out: SetRef[] = [];
  for (const item of items) for (let s = 0; s < item.sets; s++) out.push({ itemId: item.id, set: s });
  return out;
}

/** Sum of work time for every set + rest after each set under the plan, in ms. */
export function planTotal(items: WorkoutItem[], plan: PlanId): number {
  return sequenceTime(items, expandSets(items), plan);
}

/** Work + rests for a run of sets, where each rest depends on the set that follows it. */
export function sequenceTime(items: WorkoutItem[], seq: SetRef[], plan: PlanId): number {
  const byId = indexItems(items);
  let total = 0;
  for (let i = 0; i < seq.length; i++) {
    const item = byId[seq[i].itemId];
    const next = seq[i + 1] ? byId[seq[i + 1].itemId] : undefined;
    total += item.durationSec * 1000 + restAfter(plan, item, next);
  }
  return total;
}

export function indexItems(items: WorkoutItem[]): Record<string, WorkoutItem> {
  const map: Record<string, WorkoutItem> = {};
  for (const it of items) map[it.id] = it;
  return map;
}
