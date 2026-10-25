import type { Reminder } from '../engine';

export function ReminderCard({ reminder }: { reminder: Reminder | null }) {
  // The live region stays mounted so screen readers announce changes.
  return (
    <section className={`reminder${reminder ? '' : ' is-empty'}`} aria-live="polite" aria-atomic="true">
      {reminder?.kind === 'rest' && (
        <>
          <p className="reminder__main">{reminder.main}</p>
          {reminder.next && (
            <p className="reminder__next">
              <strong>{reminder.next}</strong> {reminder.cue}
            </p>
          )}
        </>
      )}
      {reminder?.kind === 'guide' && (
        <>
          <p className="reminder__main">{reminder.title}</p>
          <ul className="reminder__list">
            {reminder.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
