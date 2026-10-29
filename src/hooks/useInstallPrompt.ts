import { useCallback, useEffect, useState } from 'react';

const DISMISS_KEY = 'install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'prompt' | 'ios' | 'hidden';

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ can report as Mac with touch.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

// Capture early: the event can fire before React mounts.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

function resolveMode(): InstallMode {
  if (isStandalone()) return 'hidden';
  if (wasDismissed()) return 'hidden';
  if (deferred) return 'prompt';
  if (isIos()) return 'ios';
  return 'hidden';
}

/**
 * Returns how (or whether) to show an install card:
 * - `prompt`: Chromium fired beforeinstallprompt — show an Install button.
 * - `ios`: iPhone/iPad Safari — show Add to Home Screen instructions.
 * - `hidden`: already installed, dismissed, or not installable here.
 */
export function useInstallPrompt() {
  const [mode, setMode] = useState<InstallMode>(resolveMode);

  useEffect(() => {
    const sync = () => setMode(resolveMode());
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    const ev = deferred;
    deferred = null;
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch {
      /* user cancelled or browser refused */
    }
    setMode(resolveMode());
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setMode('hidden');
  }, []);

  return { mode, install, dismiss };
}
