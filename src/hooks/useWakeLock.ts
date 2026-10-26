import { useEffect, useState } from 'react';
// Tiny silent looping videos (MIT, from NoSleep.js) for browsers without a working Wake Lock API.
import media from 'nosleep.js/src/media.js';

/**
 * - `native`: the Screen Wake Lock API is holding the screen on.
 * - `video`: fallback: a tiny muted looping video is playing to discourage sleep.
 * - `none`: neither worked; the phone's own Auto-Lock setting applies.
 * - `off`: not requested.
 */
export type WakeLockStatus = 'off' | 'native' | 'video' | 'none';

let video: HTMLVideoElement | null = null;

function fallbackVideo(): HTMLVideoElement {
  if (video) return video;
  const v = document.createElement('video');
  v.muted = true; // muted so it never takes over the phone's audio (your music keeps playing)
  v.loop = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('muted', '');
  v.setAttribute('aria-hidden', 'true');
  v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0;';
  for (const [type, src] of [['webm', media.webm], ['mp4', media.mp4]] as const) {
    const s = document.createElement('source');
    s.src = src;
    s.type = `video/${type}`;
    v.appendChild(s);
  }
  document.body.appendChild(v);
  return (video = v);
}

/**
 * Keeps the screen on while `active`. Tries the Screen Wake Lock API first,
 * re-acquiring it whenever the tab becomes visible; if that's missing or
 * refused, falls back to a muted looping video (started on the next tap if the
 * browser needs a gesture). Never throws.
 */
export function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('off');

  useEffect(() => {
    if (!active) {
      setStatus('off');
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    let usingVideo = false;

    const startVideo = async () => {
      try {
        await fallbackVideo().play();
        usingVideo = true;
        if (!cancelled) setStatus('video');
      } catch {
        if (!cancelled) setStatus('none');
      }
    };

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      if ('wakeLock' in navigator) {
        try {
          const s = await navigator.wakeLock.request('screen');
          if (cancelled) {
            void s.release();
            return;
          }
          sentinel = s;
          setStatus('native');
          return;
        } catch {
          // Refused (unsupported embed, low power, no gesture yet…): fall through.
        }
      }
      if (usingVideo && video && !video.paused) return;
      await startVideo();
    };

    // Some browsers only allow the lock or the video after a user gesture.
    const onGesture = () => {
      if (!sentinel || sentinel.released) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', acquire);
    window.addEventListener('pointerdown', onGesture);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      window.removeEventListener('pointerdown', onGesture);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
      if (usingVideo) video?.pause();
    };
  }, [active]);

  return status;
}
