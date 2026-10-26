import type { PhaseActionId, PhaseView } from './phaseView';

interface Props {
  view: PhaseView;
  onAction: (id: PhaseActionId) => void;
}

export function PhaseTimer({ view, onAction }: Props) {
  return (
    <section className="timer" data-phase={view.key} aria-label="Set timer">
      <div className="timer__top">
        <span className="timer__label">{view.label}</span>
        <span className="timer__title">{view.title}</span>
      </div>
      <div className="timer__time num" role="timer" aria-live="off">
        {view.time}
      </div>
      <div className="timer__bar" aria-hidden="true">
        <div className="timer__barfill" style={{ width: `${Math.min(100, Math.max(0, view.fraction * 100))}%` }} />
      </div>
      <div className="timer__buttons">
        {view.actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`btn${a.primary ? ' btn--primary' : ''}`}
            disabled={a.disabled}
            onClick={() => onAction(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}
