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

/** Whether going from `item` to `next` is the switch inside a superset (A → B), not the rest after a round. */
export function isSupersetSwitch(item: WorkoutItem | undefined, next: WorkoutItem | undefined): boolean {
  const a = item?.superset;
  const b = next?.superset;
  return !!a && !!b && a.group === b.group && b.index > a.index;
}

export const MIN = 60_000;

/** A single set in the queue: which item and which (0-based) set index. */
export interface SetRef {
  itemId: string;
  set: number;
}

/**
 * Rest in ms after finishing a set of `item`, when the next set to do belongs
 * to `next`. Only lift → lift transitions get a rest; timed blocks, the last
 * lift before the cool-down and the very last set get none. Inside a superset
 * the switch is the superset's switch time, and a round counts as one exercise's set.
 */
export function restAfter(plan: PlanId, item: WorkoutItem, next: WorkoutItem | undefined): number {
  if (item.type !== 'lift' || !next || next.type !== 'lift') return 0;
  if (isSupersetSwitch(item, next)) return item.superset!.switchSec * 1000;
  const sameExercise = next.id === item.id || (!!item.superset && item.superset.group === next.superset?.group);
  const compound = item.superset ? item.superset.compound : item.isPress;
  switch (plan) {
    case 1:
      return 2 * MIN;
    case 2:
      return sameExercise ? 1 * MIN : 2 * MIN;
    case 3:
      if (!sameExercise) return 2 * MIN;
      return compound ? 2 * MIN : 1 * MIN;
  }
}

/** Rest between two sets of the same exercise, for display on the card. */
export function restBetweenSets(plan: PlanId, item: WorkoutItem): number {
  return restAfter(plan, item, item);
}

/**
 * Sets in queue order, keeping only those `include` accepts. A superset's lifts
 * are interleaved set by set at the spot of whichever one comes first.
 */
export function orderSets(items: WorkoutItem[], include: (ref: SetRef) => boolean = () => true): SetRef[] {
  const out: SetRef[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const group = item.superset?.group;
    if (group && seen.has(group)) continue;
    if (group) seen.add(group);
    const run = group
      ? items.filter((i) => i.superset?.group === group).sort((a, b) => a.superset!.index - b.superset!.index)
      : [item];
    const rounds = Math.max(...run.map((i) => i.sets));
    for (let s = 0; s < rounds; s++)
      for (const i of run) if (s < i.sets && include({ itemId: i.id, set: s })) out.push({ itemId: i.id, set: s });
  }
  return out;
}

/** Expands items in queue order into a flat list of sets. */
export function expandSets(items: WorkoutItem[]): SetRef[] {
  return orderSets(items);
}

/** Ids of every lift in the same superset as `itemId` (in superset order), or just `itemId`. */
export function supersetIds(items: WorkoutItem[], itemId: string): string[] {
  const group = items.find((i) => i.id === itemId)?.superset?.group;
  if (!group) return [itemId];
  return items
    .filter((i) => i.superset?.group === group)
    .sort((a, b) => a.superset!.index - b.superset!.index)
    .map((i) => i.id);
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
