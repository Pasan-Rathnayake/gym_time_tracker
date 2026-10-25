import type { WorkoutItem } from '../config/workout';
import { formatClock } from '../engine';
import { SetChip, type ChipState } from './SetChip';

const TAGS: Record<WorkoutItem['type'], string> = {
  cardio: 'Cardio',
  warm: 'Warm-up',
  cool: 'Cool-down',
  lift: '',
};

export interface ChipView {
  state: ChipState;
  /** Live countdown text for readying/working chips. */
  countdown?: string;
  disabled: boolean;
}

interface Props {
  item: WorkoutItem;
  chips: ChipView[];
  restLabel: string;
  moved: boolean;
  isCurrent: boolean;
  canBench: boolean;
  benchDisabled: boolean;
  onChip: (set: number) => void;
  onBench: () => void;
}

export function ExerciseCard({ item, chips, restLabel, moved, isCurrent, canBench, benchDisabled, onChip, onBench }: Props) {
  const timed = item.type !== 'lift';
  const tag = timed ? TAGS[item.type] : item.isPress ? 'Press' : 'Isolation';
  const meta = timed ? `${Math.round(item.durationSec / 60)} min` : `${item.sets} × ${item.reps}`;
  const allDone = chips.every((c) => c.state === 'done');

  return (
    <li
      className={`card card--${item.type}${moved ? ' is-moved' : ''}${isCurrent ? ' is-current' : ''}${allDone ? ' is-done' : ''}`}
    >
      <div className="card__head">
        <h3 className="card__name">{item.name}</h3>
        <span className={`tag tag--${timed ? item.type : item.isPress ? 'press' : 'iso'}`}>{tag}</span>
      </div>
      <p className="card__meta">
        <span className="num">{meta}</span>
        <span aria-hidden="true"> · </span>
        <span>{restLabel}</span>
      </p>
      {moved && !allDone && <p className="card__moved">Bench busy · moved to later</p>}
      <div className="card__chips" role="group" aria-label={`${item.name} sets`}>
        {chips.map((c, i) => {
          const base = timed ? formatClock(item.durationSec * 1000) : String(i + 1);
          const label = c.countdown ?? (c.state === 'done' ? (timed ? '✓ Done' : '✓') : base);
          const what = timed ? item.name : `${item.name} set ${i + 1}`;
          const aria =
            c.state === 'done'
              ? `${what} done. Tap to undo.`
              : c.state === 'readying'
                ? `${what}: get ready, ${c.countdown}`
                : c.state === 'working'
                  ? `${what}: working, ${c.countdown} left`
                  : `Start ${what}`;
          return (
            <SetChip
              key={i}
              state={c.state}
              label={label}
              ariaLabel={aria}
              disabled={c.disabled}
              wide={timed}
              onClick={() => onChip(i)}
            />
          );
        })}
      </div>
      {canBench && !allDone && (
        <button type="button" className="btn btn--small btn--bench" onClick={onBench} disabled={benchDisabled}>
          {moved ? 'Bench free · do next' : 'Bench busy · do later'}
        </button>
      )}
    </li>
  );
}
