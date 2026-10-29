import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DAYS, READY_SEC, type WorkoutDay } from './config/workout';
import {
  formatClock,
  indexItems,
  initialState,
  isItemDone,
  makeReducer,
  nextSet,
  normalizeState,
  orderedItems,
  planTotal,
  progress,
  reminderFor,
  restAfter,
  restBetweenSets,
  restLocked,
  stopwatchElapsed,
  timeLeft,
  type Action,
  type PlanId,
  type SessionState,
} from './engine';
import { usePersistentState } from './hooks/usePersistentState';
import { useRefreshGuard } from './hooks/useRefreshGuard';
import { useLockScreenTimer } from './hooks/useLockScreenTimer';
import { useSound } from './hooks/useSound';
import { useTicker } from './hooks/useTicker';
import { useWakeLock } from './hooks/useWakeLock';
import { DayPicker } from './components/DayPicker';
import { ExerciseCard, type ChipView } from './components/ExerciseCard';
import { GymMode } from './components/GymMode';
import { InstallCard } from './components/InstallCard';
import { phaseView, type PhaseActionId } from './components/phaseView';
import { Header } from './components/Header';
import { PhaseTimer } from './components/PhaseTimer';
import { ReminderCard } from './components/ReminderCard';
import { RestPlanPicker } from './components/RestPlanPicker';
import { Stopwatch } from './components/Stopwatch';
import { Toast } from './components/Toast';

const GYM_KEY = 'push-day:gym-mode';
const DAY_KEY = 'gym:active-day';
const LOCK_KEY = 'gym:lock-screen-timer';

/** Picks the workout day; each day keeps its own saved progress. */
export function App() {
  const [dayId, setDayId] = useState(() => {
    try {
      return localStorage.getItem(DAY_KEY) ?? DAYS[0].id;
    } catch {
      return DAYS[0].id;
    }
  });
  const day = DAYS.find((d) => d.id === dayId) ?? DAYS[0];
  const switchDay = useCallback((id: string) => {
    setDayId(id);
    try {
      localStorage.setItem(DAY_KEY, id);
    } catch {
      /* ignore */
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    document.title = day.short;
  }, [day]);

  return <Workout key={day.id} day={day} onSwitchDay={switchDay} />;
}

function Workout({ day, onSwitchDay }: { day: WorkoutDay; onSwitchDay: (id: string) => void }) {
  const WORKOUT = day.items;
  const reducer = useMemo(() => makeReducer(WORKOUT), [WORKOUT]);
  const byId = useMemo(() => indexItems(WORKOUT), [WORKOUT]);
  const [state, setState] = usePersistentState<SessionState>(
    day.storageKey,
    () => initialState(WORKOUT),
    (raw) => normalizeState(raw, WORKOUT),
  );
  const dispatch = useCallback((a: Action) => setState((s) => reducer(s, a)), [setState, reducer]);

  const { phase, stopwatch } = state;
  const timedPhase = phase.kind === 'ready' || phase.kind === 'work' || phase.kind === 'rest';
  const running = timedPhase || stopwatch.runningSince != null;
  const tickNow = useTicker(running);
  // The ticker can lag a fresh phase by up to one interval; never show "now" before the phase began.
  const anchor =
    phase.kind === 'work' || phase.kind === 'rest'
      ? phase.startedAt
      : phase.kind === 'ready'
        ? phase.endAt - READY_SEC * 1000
        : 0;
  const now = Math.max(tickNow, anchor, stopwatch.runningSince ?? 0);
  const { cues: sound, ready: soundReady } = useSound();
  useRefreshGuard(running);

  // Gym mode is a per-device view preference.
  const [gymMode, setGymModeState] = useState(() => {
    try {
      return localStorage.getItem(GYM_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setGymMode = useCallback((on: boolean) => {
    setGymModeState(on);
    try {
      localStorage.setItem(GYM_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);
  const exitGymMode = useCallback(() => setGymMode(false), [setGymMode]);

  // Lock-screen timer (Media Session). On by default — it pauses the phone's music.
  const [lockTimer, setLockTimerState] = useState(() => {
    try {
      return localStorage.getItem(LOCK_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const setLockTimer = useCallback((on: boolean) => {
    setLockTimerState(on);
    try {
      localStorage.setItem(LOCK_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  // Keep the screen on during the workout, and whenever gym mode is open.
  const wake = useWakeLock(running || gymMode);

  // Advance ready → work → done when their end timestamps pass.
  useEffect(() => {
    if ((phase.kind === 'ready' || phase.kind === 'work') && now >= phase.endAt) dispatch({ type: 'tick', now });
  }, [now, phase, dispatch]);

  // Sounds, vibration and the rest-over alert.
  const cue = useRef<{ key: string; secs: number } | null>(null);
  useEffect(() => {
    const key =
      phase.kind === 'ready' || phase.kind === 'work' || phase.kind === 'rest'
        ? `${phase.kind}:${phase.itemId}:${phase.set}:${phase.kind === 'ready' ? phase.endAt : phase.startedAt}`
        : phase.kind;
    const secs = timedPhase ? Math.ceil((phase.endAt - now) / 1000) : 0;
    const prev = cue.current;
    cue.current = { key, secs };
    if (!prev) return; // first render after load: stay quiet

    if (prev.key !== key) {
      if (phase.kind === 'ready') sound.tick();
      else if (phase.kind === 'work') sound.go();
      else if (prev.key.startsWith('work:')) sound.done();
      return;
    }
    if (secs === prev.secs) return;
    if (phase.kind === 'ready' && secs >= 1) sound.tick();
    if ((phase.kind === 'work' || phase.kind === 'rest') && secs >= 1 && secs <= 3) sound.tick();
  }, [now, phase, timedPhase, sound]);

  useEffect(() => {
    if (phase.kind === 'rest' && !phase.alerted && now >= phase.endAt) {
      sound.beeps(3);
      try {
        if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.([200, 120, 200, 120, 200]);
      } catch {
        /* unsupported */
      }
      dispatch({ type: 'restAlerted' });
    }
  }, [now, phase, sound, dispatch]);

  // Bring the reminder card into view when a rest or timed block begins.
  const reminderKey =
    phase.kind === 'rest' || (phase.kind === 'ready' && byId[phase.itemId]?.type !== 'lift')
      ? `${phase.kind}:${phase.itemId}:${phase.set}`
      : '';
  useEffect(() => {
    if (!reminderKey) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [reminderKey]);

  // Derived view data.
  const items = useMemo(() => orderedItems(WORKOUT, state.queue), [state.queue]);
  const next = nextSet(WORKOUT, state);
  const { done, total } = progress(WORKOUT, state);
  const totals = useMemo(
    () =>
      ({
        1: planTotal(items, 1),
        2: planTotal(items, 2),
        3: planTotal(items, 3),
      }) as Record<PlanId, number>,
    [items],
  );
  const locked = restLocked(state, now);
  const view = phaseView(phase, now, locked, byId, next);
  const onPhaseAction = (id: PhaseActionId) => {
    const t = Date.now();
    if (id === 'start') dispatch({ type: 'startReady', now: t });
    else if (id === 'startNow') dispatch({ type: 'startWork', now: t });
    else if (id === 'cancel') dispatch({ type: 'cancelReady' });
    else if (id === 'doneEarly') dispatch({ type: 'finishSet', now: t });
    else dispatch({ type: 'dismissRest', now: t });
  };
  useLockScreenTimer({
    active: lockTimer && running,
    phase,
    view,
    dayName: day.name,
    now,
    onPrimary: () => {
      const primary = view.actions.find((a) => a.primary);
      if (primary && !primary.disabled) onPhaseAction(primary.id);
    },
  });
  const reminder = reminderFor(WORKOUT, state);
  const left = timeLeft(WORKOUT, state, now);
  const canStartFromChip = phase.kind === 'idle' || phase.kind === 'complete' || (phase.kind === 'rest' && !locked);

  const onChip = (itemId: string, set: number) => {
    if (state.done[itemId][set]) {
      if (phase.kind !== 'work') dispatch({ type: 'undoSet', itemId, set });
    } else if (canStartFromChip) {
      dispatch({ type: 'startReady', itemId, set, now: Date.now() });
    }
  };

  // Two-tap reset, no confirm() dialog.
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (!confirmReset) return;
    const t = window.setTimeout(() => setConfirmReset(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmReset]);

  return (
    <div className="app" data-phase={phase.kind}>
      <div className="console">
        <Header title={day.short} done={done} total={total} planTotalMs={totals[state.plan]} timeLeftMs={left} />
        <PhaseTimer view={view} onAction={onPhaseAction} />
        <Stopwatch
          stopwatch={stopwatch}
          now={now}
          onPause={() => dispatch({ type: 'stopwatchPause', now: Date.now() })}
          onResume={() => dispatch({ type: 'stopwatchResume', now: Date.now() })}
          onReset={() => dispatch({ type: 'stopwatchReset', now: Date.now() })}
          onGymMode={() => setGymMode(true)}
        />
      </div>

      <main className="content">
        {!running && <InstallCard />}
        <DayPicker
          days={DAYS}
          activeId={day.id}
          locked={phase.kind === 'ready' || phase.kind === 'work' || (phase.kind === 'rest' && now < phase.endAt)}
          onChange={onSwitchDay}
        />
        <ReminderCard reminder={reminder} />

        <RestPlanPicker plan={state.plan} totals={totals} onChange={(plan) => dispatch({ type: 'setPlan', plan, now: Date.now() })} />

        <section aria-labelledby="list-title">
          <h2 id="list-title" className="section-title">
            Exercises
          </h2>
          <ol className="cards">
            {items.map((item, idx) => {
              const d = state.done[item.id];
              const chips: ChipView[] = d.map((isDone, set) => {
                const here = (phase.kind === 'ready' || phase.kind === 'work') && phase.itemId === item.id && phase.set === set;
                if (here && phase.kind === 'ready')
                  return { state: 'readying', countdown: String(Math.max(0, Math.ceil((phase.endAt - now) / 1000))), disabled: false };
                if (here && phase.kind === 'work')
                  return { state: 'working', countdown: formatClock(phase.endAt - now), disabled: false };
                if (isDone) return { state: 'done', disabled: phase.kind === 'work' };
                const isNext = !timedPhase || phase.kind === 'rest' ? next?.itemId === item.id && next.set === set : false;
                return { state: isNext ? 'next' : 'todo', disabled: !canStartFromChip };
              });

              const following = items.slice(idx + 1).find((i) => !isItemDone(state, i.id));
              const between = restBetweenSets(state.plan, item);
              const afterEx = restAfter(state.plan, item, following);
              let restLabel = 'No rest';
              if (item.type === 'lift') {
                restLabel = `Rest ${formatClock(between)}`;
                if (afterEx !== between) restLabel += afterEx ? ` · ${formatClock(afterEx)} after` : ' · none after';
              }

              const isCurrent =
                (phase.kind === 'ready' || phase.kind === 'work') ? phase.itemId === item.id : next?.itemId === item.id;

              return (
                <ExerciseCard
                  key={item.id}
                  item={item}
                  chips={chips}
                  restLabel={restLabel}
                  moved={state.moved.includes(item.id)}
                  isCurrent={isCurrent && phase.kind !== 'complete'}
                  canBench={item.type !== 'cool'}
                  benchDisabled={phase.kind === 'work' && phase.itemId === item.id}
                  onChip={(set) => onChip(item.id, set)}
                  onBench={() =>
                    dispatch({ type: state.moved.includes(item.id) ? 'benchFree' : 'benchBusy', itemId: item.id })
                  }
                />
              );
            })}
          </ol>
        </section>

        <div className="footer">
          <button
            type="button"
            className={`btn btn--danger${confirmReset ? ' is-confirm' : ''}`}
            onClick={() => {
              if (confirmReset) {
                dispatch({ type: 'reset' });
                setConfirmReset(false);
              } else setConfirmReset(true);
            }}
          >
            {confirmReset ? 'Tap again to reset' : 'Reset workout'}
          </button>
          <button
            type="button"
            className={`btn btn--ghost footer__lock${lockTimer ? ' is-on' : ''}`}
            onClick={() => setLockTimer(!lockTimer)}
            aria-pressed={lockTimer}
          >
            Lock-screen timer: {lockTimer ? 'On' : 'Off'}
          </button>
          <p className="footer__note">Shows the timer on your lock screen. Pauses your music.</p>
        </div>
      </main>

      {gymMode && (
        <GymMode
          view={view}
          onAction={onPhaseAction}
          onExit={exitGymMode}
          done={done}
          total={total}
          timeLeftMs={left}
          workoutMs={stopwatchElapsed(stopwatch, now)}
          reminder={reminder}
          wake={wake}
        />
      )}

      {running && !soundReady && (
        <div className="sound-banner" role="status">
          Sound is off after reloading. Tap anywhere to turn it back on.
        </div>
      )}

      <Toast toast={state.toast} />
    </div>
  );
}
