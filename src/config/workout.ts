// Edit this file to change the workout. Everything else (timings, totals,
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
  /** Compound press: gets the longer rest under plan 3. */
  isPress: boolean;
  /** Length of one set in seconds. */
  durationSec: number;
}

/** Length of every lift set, in seconds. */
export const LIFT_SET_SEC = 40;

/** Seconds at the start of each rest when "Start next set" and "Skip rest" are locked. */
export const REST_LOCK_SEC = 30;

/** Length of the "Get ready" countdown, in seconds. */
export const READY_SEC = 5;

const lift = (id: string, name: string, sets: number, isPress = false): WorkoutItem => ({
  id,
  name,
  type: 'lift',
  sets,
  reps: 10,
  isPress,
  durationSec: LIFT_SET_SEC,
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

export const WORKOUT: WorkoutItem[] = [
  timed('treadmill', 'Treadmill Run', 'cardio', 5),
  timed('warmup', 'Warm-up', 'warm', 5),
  lift('pec-dec', 'Pec Dec Flys', 4),
  lift('db-shoulder-press', 'Dumbbell Shoulder Press', 4, true),
  lift('incline-press', 'Incline Chest Press', 4, true),
  lift('lateral-raise', 'Dumbbell Lateral Raises', 4),
  lift('pullover', 'Pullover', 3),
  lift('rear-delt', 'Rear Delt Flys', 3),
  lift('low-high-fly', 'Upper Chest Low-to-High Flys', 3),
  timed('cooldown', 'Cool-down Stretch', 'cool', 5),
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
