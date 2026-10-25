import { formatMinutes, REST_PLANS, type PlanId } from '../engine';

interface Props {
  plan: PlanId;
  totals: Record<PlanId, number>;
  onChange: (plan: PlanId) => void;
}

export function RestPlanPicker({ plan, totals, onChange }: Props) {
  return (
    <section className="plans" aria-labelledby="plans-title">
      <h2 id="plans-title" className="section-title">
        Rest plan
      </h2>
      <div className="segmented" role="radiogroup" aria-labelledby="plans-title">
        {REST_PLANS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={plan === p.id}
            title={p.detail}
            aria-label={`${p.detail}, ${formatMinutes(totals[p.id])}`}
            className={`segmented__opt${plan === p.id ? ' is-on' : ''}`}
            onClick={() => onChange(p.id)}
          >
            <span className="segmented__label">
              {p.lines.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </span>
            <span className="segmented__total num">{formatMinutes(totals[p.id])}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
