export type ChipState = 'done' | 'next' | 'readying' | 'working' | 'todo';

interface Props {
  state: ChipState;
  label: string;
  ariaLabel: string;
  disabled: boolean;
  wide?: boolean;
  onClick: () => void;
}

export function SetChip({ state, label, ariaLabel, disabled, wide, onClick }: Props) {
  return (
    <button
      type="button"
      className={`chip chip--${state}${wide ? ' chip--wide' : ''}`}
      aria-label={ariaLabel}
      aria-pressed={state === 'done'}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="num">{label}</span>
    </button>
  );
}
