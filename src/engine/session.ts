import { READY_SEC, REST_LOCK_SEC, type WorkoutItem } from '../config/workout';
import {
  indexItems,
  orderSets,
  restAfter,
  sequenceTime,
  supersetIds,
  type PlanId,
  type SetRef,
} from './rules';

/**
 * Session state machine:
 *   idle → ready → work → rest → (idle | ready) … → complete
 * Every timed phase stores absolute timestamps so it survives sleep/backgrounding.
 */
export type Phase =
  | { kind: 'idle' }
  /** `switchSec` is set for the gap inside a superset, which replaces the usual get-ready. */
  | { kind: 'ready'; itemId: string; set: number; endAt: number; switchSec?: number }
  | { kind: 'work'; itemId: string; set: number; startedAt: number; endAt: number }
  /** itemId/set are the set that was just finished. */
  | { kind: 'rest'; itemId: string; set: number; startedAt: number; endAt: number; alerted: boolean }
  | { kind: 'complete' };

export interface Stopwatch {
  /** ms accumulated before the current running stretch. */
  accumulated: number;
  /** Timestamp the current running stretch began, or null when paused. */
  runningSince: number | null;
  /** Whether it has been started (auto-start only happens once). */
  started: boolean;
}

export interface Toast {
  id: number;
  text: string;
}

export interface SessionState {
  version: 1;
  /** Item ids in the order they will be done. */
  queue: string[];
  /** Items pushed back with "Bench busy". */
  moved: string[];
  done: Record<string, boolean[]>;
  phase: Phase;
  plan: PlanId;
  stopwatch: Stopwatch;
  toast: Toast | null;
}

export type Action =
  | { type: 'startReady'; now: number; itemId?: string; set?: number }
  | { type: 'startWork'; now: number }
  | { type: 'cancelReady' }
  | { type: 'finishSet'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'dismissRest'; now: number }
  | { type: 'restAlerted' }
  | { type: 'setPlan'; plan: PlanId; now: number }
  | { type: 'undoSet'; itemId: string; set: number }
  | { type: 'benchBusy'; itemId: string }
  | { type: 'benchFree'; itemId: string }
  | { type: 'stopwatchPause'; now: number }
  | { type: 'stopwatchResume'; now: number }
  | { type: 'stopwatchReset'; now: number }
  | { type: 'reset' };

// ---------- construction & persistence ----------

export function initialState(items: WorkoutItem[], plan: PlanId = 1): SessionState {
  return {
    version: 1,
    queue: items.map((i) => i.id),
    moved: [],
    done: Object.fromEntries(items.map((i) => [i.id, Array<boolean>(i.sets).fill(false)])),
    phase: { kind: 'idle' },
    plan,
    stopwatch: { accumulated: 0, runningSince: null, started: false },
    toast: null,
  };
}

/** Repairs saved state against the current config (items added, removed or resized). */
export function normalizeState(raw: unknown, items: WorkoutItem[]): SessionState {
  const fresh = initialState(items);
  if (!raw || typeof raw !== 'object' || (raw as SessionState).version !== 1) return fresh;
  const s = raw as SessionState;
  const ids = new Set(items.map((i) => i.id));
  const byId = indexItems(items);

  const queue = (Array.isArray(s.queue) ? s.queue : []).filter((id, i, arr) => ids.has(id) && arr.indexOf(id) === i);
  for (const it of items) if (!queue.includes(it.id)) queue.push(it.id);

  const done: Record<string, boolean[]> = {};
  for (const it of items) {
    const prev = Array.isArray(s.done?.[it.id]) ? s.done[it.id] : [];
    done[it.id] = Array.from({ length: it.sets }, (_, i) => prev[i] === true);
  }

  let phase: Phase = s.phase && typeof s.phase === 'object' ? s.phase : { kind: 'idle' };
  if ('itemId' in phase && (!byId[phase.itemId] || phase.set >= byId[phase.itemId].sets)) phase = { kind: 'idle' };

  return {
    version: 1,
    queue,
    moved: (Array.isArray(s.moved) ? s.moved : []).filter((id) => ids.has(id)),
    done,
    phase,
    plan: s.plan === 1 || s.plan === 2 || s.plan === 3 ? s.plan : 1,
    stopwatch: s.stopwatch ?? fresh.stopwatch,
    toast: s.toast ?? null,
  };
}

// ---------- selectors ----------

export function orderedItems(items: WorkoutItem[], queue: string[]): WorkoutItem[] {
  const byId = indexItems(items);
  return queue.map((id) => byId[id]).filter(Boolean);
}

/** When the current ready phase began: a superset switch has its own length. */
export function readyStartedAt(phase: Extract<Phase, { kind: 'ready' }>): number {
  return phase.endAt - (phase.switchSec ?? READY_SEC) * 1000;
}

export function isItemDone(state: SessionState, itemId: string): boolean {
  return (state.done[itemId] ?? []).every(Boolean);
}

/** All unfinished sets, in queue order (superset lifts interleaved). */
export function remainingSets(items: WorkoutItem[], state: SessionState): SetRef[] {
  return orderSets(orderedItems(items, state.queue), (ref) => !state.done[ref.itemId]?.[ref.set]);
}

/** The next set to do: first unfinished set in queue order. */
export function nextSet(items: WorkoutItem[], state: SessionState): SetRef | null {
  return remainingSets(items, state)[0] ?? null;
}

export function progress(items: WorkoutItem[], state: SessionState): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const it of items) {
    total += it.sets;
    done += (state.done[it.id] ?? []).filter(Boolean).length;
  }
  return { done, total };
}

/** Remaining time in the current phase + all remaining sets and rests, in ms. */
export function timeLeft(items: WorkoutItem[], state: SessionState, now: number): number {
  const rest = sequenceTime(items, remainingSets(items, state), state.plan);
  const p = state.phase;
  switch (p.kind) {
    case 'ready':
      return Math.max(0, p.endAt - now) + rest;
    case 'work': {
      const dur = p.endAt - p.startedAt;
      return rest - Math.min(dur, Math.max(0, now - p.startedAt));
    }
    case 'rest':
      return Math.max(0, p.endAt - now) + rest;
    default:
      return rest;
  }
}

export function stopwatchElapsed(sw: Stopwatch, now: number): number {
  return sw.accumulated + (sw.runningSince != null ? Math.max(0, now - sw.runningSince) : 0);
}

/** When the current rest unlocks: REST_LOCK_SEC in, or the end of the rest if that's sooner. */
export function restUnlockAt(phase: Phase): number {
  return phase.kind === 'rest' ? Math.min(phase.endAt, phase.startedAt + REST_LOCK_SEC * 1000) : 0;
}

/** Whether we're in the locked start of a rest (start-next, skip and set cards disabled). */
export function restLocked(state: SessionState, now: number): boolean {
  return state.phase.kind === 'rest' && now < restUnlockAt(state.phase);
}

// ---------- queue reordering ----------

/** Moves an item to the end of the queue, but always before the cool-down. */
export function moveLater(items: WorkoutItem[], queue: string[], itemId: string): string[] {
  const byId = indexItems(items);
  if (byId[itemId]?.type === 'cool') return queue;
  const q = queue.filter((id) => id !== itemId);
  let at = q.findIndex((id) => byId[id]?.type === 'cool');
  if (at < 0) at = q.length;
  q.splice(at, 0, itemId);
  return q;
}

/**
 * Moves an item back so it is the next item: ahead of the first unfinished item
 * that hasn't been started yet. An item that is part-way done stays in front.
 */
export function moveNext(
  items: WorkoutItem[],
  queue: string[],
  done: Record<string, boolean[]>,
  itemId: string,
): string[] {
  const q = queue.filter((id) => id !== itemId);
  let at = q.findIndex((id) => {
    const d = done[id] ?? [];
    return !d.every(Boolean) && !d.some(Boolean);
  });
  if (at < 0) {
    const byId = indexItems(items);
    at = q.findIndex((id) => byId[id]?.type === 'cool');
    if (at < 0) at = q.length;
  }
  q.splice(at, 0, itemId);
  return q;
}

// ---------- reducer ----------

function toast(state: SessionState, text: string): Toast {
  return { id: (state.toast?.id ?? 0) + 1, text };
}

function isUnfinished(state: SessionState, ref: SetRef): boolean {
  return state.done[ref.itemId]?.[ref.set] === false;
}

/** Rest after finishing `ref`, given whatever set comes next in `state`. */
function restFor(items: WorkoutItem[], state: SessionState, ref: SetRef, plan: PlanId): number {
  const byId = indexItems(items);
  const next = nextSet(items, state);
  return restAfter(plan, byId[ref.itemId], next ? byId[next.itemId] : undefined);
}

function startWork(items: WorkoutItem[], state: SessionState, at: number): SessionState {
  const p = state.phase;
  if (p.kind !== 'ready') return state;
  const item = indexItems(items)[p.itemId];
  const sw = state.stopwatch;
  return {
    ...state,
    phase: { kind: 'work', itemId: p.itemId, set: p.set, startedAt: at, endAt: at + item.durationSec * 1000 },
    stopwatch: sw.started ? sw : { accumulated: sw.accumulated, runningSince: at, started: true },
  };
}

function finishSet(items: WorkoutItem[], state: SessionState, at: number): SessionState {
  const p = state.phase;
  if (p.kind !== 'work') return state;
  const byId = indexItems(items);
  const done = { ...state.done, [p.itemId]: state.done[p.itemId].map((v, i) => (i === p.set ? true : v)) };
  const after: SessionState = { ...state, done };
  const next = nextSet(items, after);

  if (!next) {
    const sw = state.stopwatch;
    return {
      ...after,
      phase: { kind: 'complete' },
      stopwatch: sw.runningSince != null ? { ...sw, accumulated: stopwatchElapsed(sw, at), runningSince: null } : sw,
      toast: toast(state, 'Workout complete'),
    };
  }

  // Inside a superset, count down the switch and start the next lift's same set
  // on its own, even if this set was started out of queue order.
  const ss = byId[p.itemId].superset;
  const partner = ss && items.find((i) => i.superset?.group === ss.group && i.superset.index === ss.index + 1);
  if (partner && after.done[partner.id]?.[p.set] === false) {
    return {
      ...after,
      phase: { kind: 'ready', itemId: partner.id, set: p.set, endAt: at + ss.switchSec * 1000, switchSec: ss.switchSec },
    };
  }

  const rest = restFor(items, after, p, state.plan);
  if (rest > 0) {
    return {
      ...after,
      phase: { kind: 'rest', itemId: p.itemId, set: p.set, startedAt: at, endAt: at + rest, alerted: false },
    };
  }
  return { ...after, phase: { kind: 'idle' }, toast: toast(state, `Next: ${byId[next.itemId].name}`) };
}

export function makeReducer(items: WorkoutItem[]) {
  const byId = indexItems(items);

  return function reducer(state: SessionState, action: Action): SessionState {
    const p = state.phase;
    switch (action.type) {
      case 'startReady': {
        const canStart = p.kind === 'idle' || (p.kind === 'rest' && !restLocked(state, action.now));
        if (!canStart) return state;
        const ref: SetRef | null =
          action.itemId != null && action.set != null ? { itemId: action.itemId, set: action.set } : nextSet(items, state);
        if (!ref || !byId[ref.itemId] || !isUnfinished(state, ref)) return state;
        return { ...state, phase: { kind: 'ready', ...ref, endAt: action.now + READY_SEC * 1000 } };
      }

      case 'startWork':
        return startWork(items, state, action.now);

      case 'cancelReady':
        return p.kind === 'ready' ? { ...state, phase: { kind: 'idle' } } : state;

      case 'finishSet':
        return finishSet(items, state, action.now);

      case 'tick': {
        // Catch up on any phase boundaries that passed while asleep, using the
        // boundary timestamps rather than "now" so later phases stay accurate.
        let s = state;
        for (let guard = 0; guard < 4; guard++) {
          const ph = s.phase;
          if (ph.kind === 'ready' && action.now >= ph.endAt) s = startWork(items, s, ph.endAt);
          else if (ph.kind === 'work' && action.now >= ph.endAt) s = finishSet(items, s, ph.endAt);
          else break;
        }
        return s;
      }

      case 'dismissRest':
        // Skip rest (before zero) or Dismiss (in overtime); both blocked while locked.
        return p.kind === 'rest' && !restLocked(state, action.now) ? { ...state, phase: { kind: 'idle' } } : state;

      case 'restAlerted':
        if (p.kind !== 'rest' || p.alerted) return state;
        return { ...state, phase: { ...p, alerted: true }, toast: toast(state, 'Rest over · next set') };

      case 'setPlan': {
        if (action.plan === state.plan) return state;
        const s: SessionState = { ...state, plan: action.plan };
        if (p.kind !== 'rest') return s;
        // Re-time the running rest under the new plan, keeping time already spent.
        const endAt = p.startedAt + restFor(items, state, p, action.plan);
        return { ...s, phase: { ...p, endAt, alerted: p.alerted && action.now >= endAt } };
      }

      case 'undoSet': {
        if (p.kind === 'work') return state;
        const d = state.done[action.itemId];
        if (!d || !d[action.set]) return state;
        return {
          ...state,
          done: { ...state.done, [action.itemId]: d.map((v, i) => (i === action.set ? false : v)) },
          phase: p.kind === 'complete' ? { kind: 'idle' } : p,
        };
      }

      // A superset's lifts share the bench and move together.
      case 'benchBusy': {
        const ids = supersetIds(items, action.itemId);
        if (p.kind === 'work' && ids.includes(p.itemId)) return state;
        if (ids.every((id) => isItemDone(state, id)) || byId[action.itemId]?.type === 'cool') return state;
        return {
          ...state,
          queue: ids.reduce((q, id) => moveLater(items, q, id), state.queue),
          moved: [...state.moved.filter((id) => !ids.includes(id)), ...ids],
        };
      }

      case 'benchFree': {
        const ids = supersetIds(items, action.itemId);
        if (p.kind === 'work' && ids.includes(p.itemId)) return state;
        return {
          ...state,
          // Last first, so each moveNext lands the earlier lift in front of it.
          queue: [...ids].reverse().reduce((q, id) => moveNext(items, q, state.done, id), state.queue),
          moved: state.moved.filter((id) => !ids.includes(id)),
        };
      }

      case 'stopwatchPause': {
        const sw = state.stopwatch;
        if (sw.runningSince == null) return state;
        return { ...state, stopwatch: { ...sw, accumulated: stopwatchElapsed(sw, action.now), runningSince: null } };
      }

      case 'stopwatchResume': {
        const sw = state.stopwatch;
        if (sw.runningSince != null) return state;
        return { ...state, stopwatch: { ...sw, runningSince: action.now, started: true } };
      }

      case 'stopwatchReset': {
        const running = state.stopwatch.runningSince != null;
        return {
          ...state,
          stopwatch: { accumulated: 0, runningSince: running ? action.now : null, started: running },
        };
      }

      case 'reset':
        return initialState(items, state.plan);
    }
  };
}
