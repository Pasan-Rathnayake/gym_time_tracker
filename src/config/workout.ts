// Edit this file to change the workouts. Everything else (timings, totals,
// reminders, UI) is derived from it.

export type ItemType = 'cardio' | 'warm' | 'lift' | 'cool';

export interface WorkoutItem {
  /** Stable id. Saved progress is keyed by it, so avoid renaming mid-workout. */
  id: string;
  name: string;
  type: ItemType;
  sets: number;
  /** Reps per set (lifts only; 0 for timed blocks). */
  reps: number;
  /** Compound lift (presses, squats, dips): gets the longer rest under plan 3. */
  isPress: boolean;
  /** Length of one set in seconds. */
  durationSec: number;
  /** Card tag override, e.g. "Compound". Defaults to Press / Isolation. */
  tag?: string;
  /** Extra note after sets × reps, e.g. "each leg". */
  note?: string;
}

export interface WorkoutDay {
  id: string;
  /** Full name, shown on the day picker. */
  name: string;
  /** Short name for the header, e.g. "Push Day". */
  short: string;
  items: WorkoutItem[];
  /** localStorage key for this day's progress. */
  storageKey: string;
}

/** Length of every lift set, in seconds. */
export const LIFT_SET_SEC = 40;

/** Seconds at the start of each rest when "Start next set" and "Skip rest" are locked. */
export const REST_LOCK_SEC = 30;

/** Length of the "Get ready" countdown, in seconds. */
export const READY_SEC = 10;

interface LiftOptions {
  /** Compound lift: longer rest under plan 3. */
  compound?: boolean;
  reps?: number;
  tag?: string;
  note?: string;
  durationSec?: number;
}

const lift = (id: string, name: string, sets: number, opts: LiftOptions = {}): WorkoutItem => ({
  id,
  name,
  type: 'lift',
  sets,
  reps: opts.reps ?? 10,
  isPress: opts.compound ?? false,
  durationSec: opts.durationSec ?? LIFT_SET_SEC,
  tag: opts.tag,
  note: opts.note,
});

const timed = (id: string, name: string, type: ItemType, minutes: number): WorkoutItem => ({
  id,
  name,
  type,
  sets: 1,
  reps: 0,
  isPress: false,
  durationSec: minutes * 60,
});

/**
 * Set to true to bring back the treadmill run, warm-up and cool-down blocks.
 * Turned off for now: the workout is lifts only.
 */
export const INCLUDE_TIMED_BLOCKS = false;

const liftsOnly = (items: WorkoutItem[]) => (INCLUDE_TIMED_BLOCKS ? items : items.filter((i) => i.type === 'lift'));

/** Day 1, Chest & Shoulders, including its timed blocks (see INCLUDE_TIMED_BLOCKS). */
export const PUSH_DAY_ITEMS: WorkoutItem[] = [
  timed('treadmill', 'Treadmill Run', 'cardio', 5),
  timed('warmup', 'Warm-up', 'warm', 5),
  lift('pec-dec', 'Pec Dec Flys', 4),
  lift('db-shoulder-press', 'Dumbbell Shoulder Press', 4, { compound: true }),
  lift('incline-press', 'Incline Chest Press', 4, { compound: true }),
  lift('lateral-raise', 'Dumbbell Lateral Raises', 4),
  lift('pullover', 'Pullover', 3),
  lift('rear-delt', 'Rear Delt Flys', 3),
  lift('low-high-fly', 'Upper Chest Low-to-High Flys', 3),
  timed('cooldown', 'Cool-down Stretch', 'cool', 5),
];

/** Day 2, Legs & Triceps. */
export const LEG_DAY_ITEMS: WorkoutItem[] = [
  lift('full-squat', 'Full Squat', 4, { compound: true, tag: 'Compound' }),
  lift('hyper-extension', 'Hyper Extension', 3),
  lift('sumo-squat', 'Sumo Squat', 3, { compound: true, tag: 'Compound' }),
  lift('triceps-pushdown', 'Triceps Push Down', 4),
  lift('leg-curl', 'Leg Curls', 3),
  lift('triceps-cable', 'Triceps Cables', 3, { reps: 12 }),
  // One leg at a time, so each set gets twice the time (40s per leg).
  lift('leg-extension', 'Leg Extension', 3, { note: 'each leg', durationSec: LIFT_SET_SEC * 2 }),
  lift('triceps-dips', 'Triceps Dips', 3, { compound: true, tag: 'Compound' }),
  lift('calf-raise', 'Calf Raises', 3),
];

/** Day 3, Back & Biceps. */
export const PULL_DAY_ITEMS: WorkoutItem[] = [
  lift('pullups', 'Pull-ups', 3, { compound: true, tag: 'Compound' }),
  lift('smith-row', 'Smith Machine Row', 3, { compound: true, tag: 'Compound' }),
  lift('supinated-pulldown', 'Supinated Pull Down', 3, { compound: true, tag: 'Compound' }),
  lift('t-bar-row', 'T-Bar Row', 3, { compound: true, tag: 'Compound' }),
  lift('cable-curl', 'Cable Biceps Curl', 4),
  lift('straight-arm-pulldown', 'Straight Arm Pull Down', 3),
  lift('hammer-curl', 'Hammer Curl', 3),
  // One arm at a time, so each set gets twice the time (40s per arm).
  lift('one-arm-row', 'One Arm Row', 3, { compound: true, tag: 'Compound', note: 'each arm', durationSec: LIFT_SET_SEC * 2 }),
  lift('reverse-curl', 'Reverse Curl', 3),
  lift('shrugs', 'Shrugs', 3, { reps: 12 }),
  lift('forearms', 'Forearms', 3),
];

/** The workout days, in the order shown on the day picker. */
export const DAYS: WorkoutDay[] = [
  {
    id: 'push',
    name: 'Chest & Shoulders',
    short: 'Push Day',
    items: liftsOnly(PUSH_DAY_ITEMS),
    storageKey: 'push-day:session:v1',
  },
  {
    id: 'legs',
    name: 'Legs & Triceps',
    short: 'Leg Day',
    items: liftsOnly(LEG_DAY_ITEMS),
    storageKey: 'leg-day:session:v1',
  },
  {
    id: 'pull',
    name: 'Back & Biceps',
    short: 'Pull Day',
    items: liftsOnly(PULL_DAY_ITEMS),
    storageKey: 'pull-day:session:v1',
  },
];

/** Rest-time reminder shown on alternate rests (the others rotate through TIPS). */
export const WATER_LINE = 'Drink some water. A few sips, not a full bottle.';

export const TIPS: string[] = [
  'Slow breathing: in through the nose for 4, out through the mouth for 6.',
  'Shake out your arms and roll your shoulders back a few times.',
  'Check the weight. If the last set felt easy, go up a step.',
  'Walk a few steps to keep the blood moving.',
  'Wipe your hands and the bench.',
  'Relax your neck and traps. Let your shoulders drop.',
];

/** One-line form cue per lift, keyed by item id. */
export const FORM_CUES: Record<string, string> = {
  'pec-dec': 'Soft elbows, squeeze the chest together and control the way back.',
  'db-shoulder-press': 'Brace your core, press straight up and keep the ribs down.',
  'incline-press': 'Shoulder blades pinned back, lower to the upper chest.',
  'lateral-raise': 'Lead with the elbows and stop at shoulder height. No swinging.',
  pullover: 'Slight bend in the elbows, stretch long and pull with the lats.',
  'rear-delt': 'Pinkies up, lead with the elbows and pause at the back.',
  'low-high-fly': 'Sweep up and in to eye level, squeeze the upper chest.',
  'full-squat': 'Chest up, knees track over the toes, sit down to full depth.',
  'hyper-extension': 'Hinge at the hips, squeeze the glutes at the top. Don\'t over-arch.',
  'sumo-squat': 'Wide stance, toes out, push the knees out and keep the chest tall.',
  'triceps-pushdown': 'Elbows pinned to your sides, lock out and squeeze at the bottom.',
  'leg-curl': 'Hips down on the pad, curl all the way and lower slowly.',
  'triceps-cable': 'Keep the elbows still and only move the forearms.',
  'leg-extension': 'One leg at a time. Pause and squeeze at the top, lower slowly.',
  'triceps-dips': 'Body upright, lower until the elbows hit 90°, press to lockout.',
  'calf-raise': 'Full stretch at the bottom, pause up high on the toes.',
  pullups: 'Start from a dead hang, pull your chest to the bar, lower under control.',
  'smith-row': 'Hinge to about 45°, flat back, pull the bar to your lower ribs.',
  'supinated-pulldown': 'Palms facing you, lean back slightly and pull to the upper chest.',
  't-bar-row': 'Chest up, back flat, drive the elbows back and squeeze.',
  'cable-curl': 'Elbows fixed at your sides, curl all the way up and lower slowly.',
  'straight-arm-pulldown': 'Arms long with soft elbows, sweep down to the thighs using the lats.',
  'hammer-curl': 'Thumbs up, no swinging, keep the elbows still.',
  'one-arm-row': 'One arm at a time. Brace on the bench and pull the elbow to your hip.',
  'reverse-curl': 'Palms down, wrists straight, lower slowly.',
  shrugs: 'Lift straight up toward the ears, pause, no rolling.',
  forearms: 'Full range at the wrist, slow and controlled.',
};

/** Guides shown during the timed blocks, keyed by item id. */
export const GUIDES: Record<string, { title: string; lines: string[] }> = {
  treadmill: {
    title: 'Treadmill',
    lines: ['Steady jog or brisk incline walk.', 'Warm, but not out of breath.'],
  },
  warmup: {
    title: 'Warm-up',
    lines: [
      'Arm circles, 30s each way.',
      'Band pull-aparts ×15.',
      'Push-ups ×10.',
      'Light pec dec ×15.',
    ],
  },
  cooldown: {
    title: 'Cool-down',
    lines: [
      'Doorway chest stretch.',
      'Cross-body shoulder stretch.',
      'Overhead triceps stretch.',
      'Lat stretch.',
      'Hold each 30–45s.',
    ],
  },
};
