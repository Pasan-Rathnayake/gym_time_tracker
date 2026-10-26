import { describe, expect, it } from 'vitest';
import { DAYS, INCLUDE_TIMED_BLOCKS, LEG_DAY_ITEMS, PUSH_DAY_ITEMS, READY_SEC, type WorkoutItem } from '../config/workout';
import {
  MIN,
  indexItems,
  initialState,
  makeReducer,
  moveLater,
  moveNext,
  nextSet,
  normalizeState,
  planTotal,
  reminderFor,
  restAfter,
  restLocked,
  timeLeft,
  type Action,
  type SessionState,
} from './index';

// Engine rules are tested against the full definition (with timed blocks),
// whatever the app currently has switched on.
const WORKOUT = PUSH_DAY_ITEMS;
const byId = indexItems(WORKOUT);
const reduce = makeReducer(WORKOUT);
const T0 = 1_700_000_000_000;

function run(state: SessionState, ...actions: Action[]): SessionState {
  return actions.reduce(reduce, state);
}

/** Starts the next set and runs it to completion via tick at its end. */
function doNextSet(state: SessionState, now: number): { state: SessionState; now: number } {
  let s = reduce(state, { type: 'startReady', now });
  if (s.phase.kind !== 'ready') throw new Error(`could not start from ${state.phase.kind}`);
  now = s.phase.endAt;
  s = reduce(s, { type: 'tick', now });
  if (s.phase.kind !== 'work') throw new Error('expected work');
  now = s.phase.endAt;
  s = reduce(s, { type: 'tick', now });
  return { state: s, now };
}

describe('plan totals', () => {
  it('match the expected totals for the default config', () => {
    expect(Math.round(planTotal(WORKOUT, 1) / MIN)).toBe(80);
    expect(Math.round(planTotal(WORKOUT, 2) / MIN)).toBe(62);
    expect(Math.round(planTotal(WORKOUT, 3) / MIN)).toBe(68);
  });

  const totals = (items: WorkoutItem[]) => [1, 2, 3].map((p) => Math.round(planTotal(items, p as 1 | 2 | 3) / MIN));

  it('match the expected totals for the push day the app runs', () => {
    const push = DAYS.find((d) => d.id === 'push')!;
    expect(totals(push.items)).toEqual(INCLUDE_TIMED_BLOCKS ? [80, 62, 68] : [65, 47, 53]);
  });

  it('match the expected totals for leg day', () => {
    // 29 sets: 26 × 40s + leg extension 3 × 80s (one leg at a time).
    expect(totals(LEG_DAY_ITEMS)).toEqual([77, 57, 64]);
  });

  it('every day has unique item ids and its own storage key', () => {
    const ids = DAYS.flatMap((d) => d.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(DAYS.map((d) => d.storageKey)).size).toBe(DAYS.length);
  });

  it('leg day: plan 3 gives compound lifts 2 min and isolation 1 min', () => {
    const legs = indexItems(LEG_DAY_ITEMS);
    expect(restAfter(3, legs['full-squat'], legs['full-squat'])).toBe(2 * MIN);
    expect(restAfter(3, legs['triceps-dips'], legs['triceps-dips'])).toBe(2 * MIN);
    expect(restAfter(3, legs['leg-curl'], legs['leg-curl'])).toBe(1 * MIN);
    expect(restAfter(3, legs['calf-raise'], undefined)).toBe(0);
  });

  it('lifts-only workout has no timed blocks and no rest after the final set', () => {
    const lifts = PUSH_DAY_ITEMS.filter((i) => i.type === 'lift');
    let s = initialState(lifts);
    for (const it of lifts) s.done[it.id] = s.done[it.id].map(() => true);
    s.done['low-high-fly'] = [true, true, false];
    s = makeReducer(lifts)(s, { type: 'startReady', now: T0 });
    s = makeReducer(lifts)(s, { type: 'tick', now: T0 + 60_000 });
    expect(s.phase.kind).toBe('complete');
  });

  it('time left at the start equals the plan total', () => {
    const s = initialState(WORKOUT, 2);
    expect(timeLeft(WORKOUT, s, T0)).toBe(planTotal(WORKOUT, 2));
  });
});

describe('rest rules', () => {
  const pec = byId['pec-dec'];
  const press = byId['db-shoulder-press'];
  const cool = byId['cooldown'];

  it('plan 1: 2 min after every lift set', () => {
    expect(restAfter(1, pec, pec)).toBe(2 * MIN);
    expect(restAfter(1, pec, press)).toBe(2 * MIN);
  });

  it('plan 2: 1 min between sets, 2 min between exercises', () => {
    expect(restAfter(2, pec, pec)).toBe(1 * MIN);
    expect(restAfter(2, press, press)).toBe(1 * MIN);
    expect(restAfter(2, pec, press)).toBe(2 * MIN);
  });

  it('plan 3: 2 min after presses, 1 min after isolation, 2 min between exercises', () => {
    expect(restAfter(3, press, press)).toBe(2 * MIN);
    expect(restAfter(3, pec, pec)).toBe(1 * MIN);
    expect(restAfter(3, pec, press)).toBe(2 * MIN);
  });

  it('no rest after the last lift before the cool-down, or after the final set', () => {
    const last = byId['low-high-fly'];
    for (const plan of [1, 2, 3] as const) {
      expect(restAfter(plan, last, cool)).toBe(0);
      expect(restAfter(plan, last, undefined)).toBe(0);
    }
  });

  it('no rest follows timed blocks', () => {
    for (const id of ['treadmill', 'warmup', 'cooldown']) {
      for (const plan of [1, 2, 3] as const) {
        expect(restAfter(plan, byId[id], pec)).toBe(0);
        expect(restAfter(plan, byId[id], byId['warmup'])).toBe(0);
      }
    }
  });

  it('finishing a timed block goes straight to idle with a "Next" toast', () => {
    const { state } = doNextSet(initialState(WORKOUT), T0);
    expect(state.done.treadmill).toEqual([true]);
    expect(state.phase.kind).toBe('idle');
    expect(state.toast?.text).toBe('Next: Warm-up');

    const second = doNextSet(state, T0 + 10 * MIN).state;
    expect(second.phase.kind).toBe('idle');
    expect(second.toast?.text).toBe('Next: Pec Dec Flys');
  });

  it('finishing the last lift set goes to idle (no rest) before the cool-down', () => {
    let s = initialState(WORKOUT);
    for (const it of WORKOUT) if (it.id !== 'low-high-fly' && it.id !== 'cooldown') s.done[it.id] = s.done[it.id].map(() => true);
    s.done['low-high-fly'] = [true, true, false];
    s = doNextSet(s, T0).state;
    expect(s.phase.kind).toBe('idle');
    expect(s.toast?.text).toBe('Next: Cool-down Stretch');
  });

  it('a lift set is followed by a rest under the selected plan', () => {
    let s = initialState(WORKOUT, 2);
    s.done.treadmill = [true];
    s.done.warmup = [true];
    const r = doNextSet(s, T0);
    s = r.state;
    expect(s.phase.kind).toBe('rest');
    if (s.phase.kind !== 'rest') return;
    expect(s.phase.endAt - s.phase.startedAt).toBe(1 * MIN);
  });
});

describe('session flow', () => {
  it('ready lasts READY_SEC, work lasts the set duration, and start/skip are locked for the first 30s of a rest', () => {
    let s = initialState(WORKOUT);
    s.done.treadmill = [true];
    s.done.warmup = [true];
    s = reduce(s, { type: 'startReady', now: T0 });
    expect(s.phase).toMatchObject({ kind: 'ready', itemId: 'pec-dec', set: 0, endAt: T0 + READY_SEC * 1000 });
    s = reduce(s, { type: 'startWork', now: T0 + 1000 });
    expect(s.phase).toMatchObject({ kind: 'work', startedAt: T0 + 1000, endAt: T0 + 41_000 });
    expect(s.stopwatch.runningSince).toBe(T0 + 1000);

    s = reduce(s, { type: 'finishSet', now: T0 + 20_000 });
    expect(s.phase.kind).toBe('rest');
    // Locked for the first 30s of the rest.
    expect(restLocked(s, T0 + 20_000 + 29_999)).toBe(true);
    expect(reduce(s, { type: 'startReady', now: T0 + 20_000 + 29_999 })).toBe(s);
    expect(reduce(s, { type: 'dismissRest', now: T0 + 20_000 + 29_999 })).toBe(s);
    // Unlocked after 30s, while the rest is still counting down.
    expect(restLocked(s, T0 + 20_000 + 30_000)).toBe(false);
    expect(reduce(s, { type: 'startReady', now: T0 + 20_000 + 30_000 }).phase).toMatchObject({ kind: 'ready', itemId: 'pec-dec', set: 1 });
    expect(reduce(s, { type: 'dismissRest', now: T0 + 20_000 + 30_000 }).phase.kind).toBe('idle');
    const alerted = reduce(s, { type: 'restAlerted' });
    expect(alerted.toast?.text).toBe('Rest over · next set');
    expect(reduce(alerted, { type: 'restAlerted' })).toBe(alerted);
    // Unlocked once over.
    const after = reduce(s, { type: 'startReady', now: T0 + 20_000 + 2 * MIN });
    expect(after.phase).toMatchObject({ kind: 'ready', itemId: 'pec-dec', set: 1 });
  });

  it('tick catches up across sleep using phase boundary timestamps', () => {
    let s = initialState(WORKOUT);
    s.done.treadmill = [true];
    s.done.warmup = [true];
    s = reduce(s, { type: 'startReady', now: T0 });
    s = reduce(s, { type: 'tick', now: T0 + 10 * MIN });
    expect(s.phase.kind).toBe('rest');
    if (s.phase.kind !== 'rest') return;
    expect(s.phase.startedAt).toBe(T0 + READY_SEC * 1000 + 40_000);
    expect(s.done['pec-dec'][0]).toBe(true);
  });

  it('undo is blocked during work and restores a set otherwise', () => {
    let s = initialState(WORKOUT);
    s.done.treadmill = [true];
    s = run(s, { type: 'startReady', now: T0 }, { type: 'startWork', now: T0 });
    expect(reduce(s, { type: 'undoSet', itemId: 'treadmill', set: 0 })).toBe(s);
    s = reduce(s, { type: 'cancelReady' }); // no-op in work
    s = reduce(s, { type: 'finishSet', now: T0 + 1000 });
    s = reduce(s, { type: 'undoSet', itemId: 'treadmill', set: 0 });
    expect(s.done.treadmill).toEqual([false]);
    expect(nextSet(WORKOUT, s)).toEqual({ itemId: 'treadmill', set: 0 });
  });

  it('stopwatch keeps running through rests and queue changes, and supports pause/reset', () => {
    let s = initialState(WORKOUT);
    s = run(s, { type: 'startReady', now: T0 }, { type: 'startWork', now: T0 });
    expect(s.stopwatch.runningSince).toBe(T0);
    s = reduce(s, { type: 'benchBusy', itemId: 'pullover' });
    expect(s.stopwatch.runningSince).toBe(T0);
    s = reduce(s, { type: 'stopwatchPause', now: T0 + 5000 });
    expect(s.stopwatch).toMatchObject({ accumulated: 5000, runningSince: null });
    s = reduce(s, { type: 'stopwatchResume', now: T0 + 9000 });
    s = reduce(s, { type: 'stopwatchReset', now: T0 + 10_000 });
    expect(s.stopwatch).toMatchObject({ accumulated: 0, runningSince: T0 + 10_000 });
  });
});

describe('rest re-timing on plan switch', () => {
  function restingAfterPecDecSet1(plan: 1 | 2 | 3): SessionState {
    let s = initialState(WORKOUT, plan);
    s.done.treadmill = [true];
    s.done.warmup = [true];
    return doNextSet(s, T0).state;
  }

  it('re-times the current rest, keeping the time already spent', () => {
    let s = restingAfterPecDecSet1(1);
    if (s.phase.kind !== 'rest') throw new Error('expected rest');
    const startedAt = s.phase.startedAt;
    expect(s.phase.endAt - startedAt).toBe(2 * MIN);

    s = reduce(s, { type: 'setPlan', plan: 2, now: startedAt + 30_000 });
    expect(s.plan).toBe(2);
    expect(s.phase).toMatchObject({ kind: 'rest', startedAt, endAt: startedAt + 1 * MIN });
    // 30s spent, 30s left.
    expect(s.phase.kind === 'rest' && s.phase.endAt - (startedAt + 30_000)).toBe(30_000);
  });

  it('switching to a shorter plan after its length has passed ends the rest immediately', () => {
    let s = restingAfterPecDecSet1(1);
    if (s.phase.kind !== 'rest') throw new Error('expected rest');
    const startedAt = s.phase.startedAt;
    s = reduce(s, { type: 'setPlan', plan: 3, now: startedAt + 90_000 });
    expect(s.phase).toMatchObject({ kind: 'rest', endAt: startedAt + 1 * MIN });
    expect(reduce(s, { type: 'startReady', now: startedAt + 90_000 }).phase.kind).toBe('ready');
  });
});

describe('bench busy reorder', () => {
  const coolIdx = (q: string[]) => q.indexOf('cooldown');

  it('moves an item to the end, always before the cool-down', () => {
    const q = moveLater(WORKOUT, WORKOUT.map((i: WorkoutItem) => i.id), 'pec-dec');
    expect(q[q.length - 1]).toBe('cooldown');
    expect(q[q.length - 2]).toBe('pec-dec');
    expect(q).toHaveLength(WORKOUT.length);
  });

  it('keeps the cool-down last even when it has been reordered', () => {
    const custom = ['treadmill', 'cooldown', 'warmup', 'pec-dec'];
    const items: WorkoutItem[] = custom.map((id) => byId[id]);
    const q = moveLater(items, custom, 'treadmill');
    expect(q.indexOf('treadmill')).toBe(coolIdx(q) - 1);
  });

  it('keeps completed sets and marks the item as moved', () => {
    let s = initialState(WORKOUT);
    s.done['pec-dec'] = [true, true, false, false];
    s = reduce(s, { type: 'benchBusy', itemId: 'pec-dec' });
    expect(s.done['pec-dec']).toEqual([true, true, false, false]);
    expect(s.moved).toContain('pec-dec');
    expect(s.queue.indexOf('pec-dec')).toBe(coolIdx(s.queue) - 1);
  });

  it('is disabled while that item is in the work phase, and leaves a running rest alone', () => {
    let s = initialState(WORKOUT);
    s = run(s, { type: 'startReady', now: T0 }, { type: 'startWork', now: T0 });
    expect(reduce(s, { type: 'benchBusy', itemId: 'treadmill' })).toBe(s);

    let r = initialState(WORKOUT);
    r.done.treadmill = [true];
    r.done.warmup = [true];
    r = doNextSet(r, T0).state;
    const before = r.phase;
    r = reduce(r, { type: 'benchBusy', itemId: 'db-shoulder-press' });
    expect(r.phase).toBe(before);
  });

  it('cannot move the cool-down or a finished item', () => {
    const s = initialState(WORKOUT);
    expect(reduce(s, { type: 'benchBusy', itemId: 'cooldown' })).toBe(s);
    const done = { ...s, done: { ...s.done, treadmill: [true] } };
    expect(reduce(done, { type: 'benchBusy', itemId: 'treadmill' })).toBe(done);
  });

  it('"Bench free" moves the item back to be next, after any part-done item', () => {
    let s = initialState(WORKOUT);
    s.done.treadmill = [true];
    s.done.warmup = [true];
    s.done['pec-dec'] = [true, false, false, false];
    s = reduce(s, { type: 'benchBusy', itemId: 'lateral-raise' });
    s = reduce(s, { type: 'benchFree', itemId: 'lateral-raise' });
    expect(s.moved).not.toContain('lateral-raise');
    expect(s.queue.slice(0, 4)).toEqual(['treadmill', 'warmup', 'pec-dec', 'lateral-raise']);
  });

  it('next set follows queue order after a move', () => {
    let s = initialState(WORKOUT);
    s.done.treadmill = [true];
    s.done.warmup = [true];
    s = reduce(s, { type: 'benchBusy', itemId: 'pec-dec' });
    expect(nextSet(WORKOUT, s)).toEqual({ itemId: 'db-shoulder-press', set: 0 });
    const q = moveNext(WORKOUT, s.queue, s.done, 'pec-dec');
    expect(q.indexOf('pec-dec')).toBe(2);
  });
});

describe('reminders', () => {
  it('shows the finished-exercise line, alternates water and tips otherwise, and includes the form cue', () => {
    let s = initialState(WORKOUT);
    s.done.treadmill = [true];
    s.done.warmup = [true];
    let now = T0;
    ({ state: s, now } = doNextSet(s, now));
    let r = reminderFor(WORKOUT, s);
    expect(r).toMatchObject({ kind: 'rest', main: 'Drink some water. A few sips, not a full bottle.', next: 'Next: Pec Dec Flys set 2.' });

    ({ state: s, now } = doNextSet(s, now + 2 * MIN));
    r = reminderFor(WORKOUT, s);
    expect(r?.kind === 'rest' && r.main).not.toMatch(/water/i);

    s.done['pec-dec'] = [true, true, true, false];
    ({ state: s, now } = doNextSet(s, now + 2 * MIN));
    r = reminderFor(WORKOUT, s);
    expect(r).toMatchObject({
      main: 'Pec Dec Flys done. Drink water and set up for Dumbbell Shoulder Press.',
      next: 'Next: Dumbbell Shoulder Press set 1.',
    });
  });

  it('shows the block guide during timed blocks and nothing when idle', () => {
    let s = initialState(WORKOUT);
    expect(reminderFor(WORKOUT, s)).toBeNull();
    s = reduce(s, { type: 'startReady', now: T0 });
    expect(reminderFor(WORKOUT, s)).toMatchObject({ kind: 'guide', title: 'Treadmill' });
  });
});

describe('persistence', () => {
  it('normalizes saved state against the config', () => {
    const s = normalizeState({ version: 1, queue: ['gone', 'pec-dec'], done: { 'pec-dec': [true] }, plan: 9 }, WORKOUT);
    expect(s.queue[0]).toBe('pec-dec');
    expect(s.queue).toHaveLength(WORKOUT.length);
    expect(s.done['pec-dec']).toEqual([true, false, false, false]);
    expect(s.plan).toBe(1);
    expect(normalizeState('junk', WORKOUT)).toEqual(initialState(WORKOUT));
  });
});
