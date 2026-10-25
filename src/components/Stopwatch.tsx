import { formatClock, stopwatchElapsed, type Stopwatch as SW } from '../engine';

interface Props {
  stopwatch: SW;
  now: number;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}

export function Stopwatch({ stopwatch, now, onPause, onResume, onReset }: Props) {
  const running = stopwatch.runningSince != null;
  const elapsed = stopwatchElapsed(stopwatch, now);
  return (
    <div className="stopwatch">
      <span className="stopwatch__label">Workout</span>
      <span className="stopwatch__time num" aria-label={`Workout time ${formatClock(elapsed, false)}`}>
        {formatClock(elapsed, false)}
      </span>
      <button type="button" className="btn btn--small btn--ghost" onClick={running ? onPause : onResume}>
        {running ? 'Pause' : stopwatch.started || elapsed > 0 ? 'Resume' : 'Start'}
      </button>
      <button type="button" className="btn btn--small btn--ghost" onClick={onReset} disabled={elapsed === 0 && !running}>
        Reset
      </button>
    </div>
  );
}
