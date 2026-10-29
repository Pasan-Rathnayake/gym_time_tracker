import { useInstallPrompt } from '../hooks/useInstallPrompt';

/** In-app install help: Install button (Chromium) or Add to Home Screen tip (iOS). */
export function InstallCard() {
  const { mode, install, dismiss } = useInstallPrompt();
  if (mode === 'hidden') return null;

  return (
    <section className="install-card" aria-label="Install the app">
      <div className="install-card__body">
        <p className="install-card__title">Install the app</p>
        <p className="install-card__text">
          {mode === 'prompt'
            ? 'Add it to your home screen for offline use and a full-screen view.'
            : 'Tap Share, then Add to Home Screen.'}
        </p>
      </div>
      <div className="install-card__actions">
        {mode === 'prompt' && (
          <button type="button" className="btn btn--small btn--primary" onClick={() => void install()}>
            Install
          </button>
        )}
        <button type="button" className="btn btn--small btn--ghost" onClick={dismiss} aria-label="Dismiss">
          Dismiss
        </button>
      </div>
    </section>
  );
}
