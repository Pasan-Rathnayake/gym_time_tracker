import type { WorkoutDay } from '../config/workout';

interface Props {
  days: WorkoutDay[];
  activeId: string;
  /** True while a set or rest is running: switching is blocked. */
  locked: boolean;
  onChange: (id: string) => void;
}

export function DayPicker({ days, activeId, locked, onChange }: Props) {
  return (
    <section aria-labelledby="day-title">
      <h2 id="day-title" className="section-title">
        Workout day
      </h2>
      <div className="segmented segmented--days" role="radiogroup" aria-labelledby="day-title">
        {days.map((d, i) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={d.id === activeId}
            className={`segmented__opt${d.id === activeId ? ' is-on' : ''}`}
            disabled={locked && d.id !== activeId}
            onClick={() => d.id !== activeId && onChange(d.id)}
          >
            <span className="segmented__label">
              <span>Day {i + 1}</span>
            </span>
            <span className="segmented__day">{d.name}</span>
          </button>
        ))}
      </div>
      {locked && <p className="segmented__hint">Finish or cancel the current set or rest to switch days.</p>}
    </section>
  );
}
