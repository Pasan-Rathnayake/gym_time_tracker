import { formatClock, formatMinutes } from '../engine';

interface Props {
  title: string;
  done: number;
  total: number;
  planTotalMs: number;
  timeLeftMs: number;
}

export function Header({ title, done, total, planTotalMs, timeLeftMs }: Props) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <header className="header">
      <div className="header__row">
        <h1 className="header__title">{title}</h1>
        <dl className="header__stats">
          <div>
            <dt>Steps</dt>
            <dd className="num">
              {done}/{total}
            </dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd className="num">{formatMinutes(planTotalMs)}</dd>
          </div>
          <div>
            <dt>Left</dt>
            <dd className="num">{formatClock(timeLeftMs)}</dd>
          </div>
        </dl>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label="Workout progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}
