import { useEffect, useRef } from 'react';
import { READY_SEC } from '../config/workout';
import type { Phase } from '../engine';
import type { PhaseView } from '../components/phaseView';

/** ~10s silent WAV (8 kHz, 8-bit mono). Longer than 5s so Chrome shows media controls. */
function silentWavUrl(): string {
  const sampleRate = 8000;
  const seconds = 10;
  const dataSize = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  // 8-bit PCM silence is 128
  for (let i = 0; i < dataSize; i++) view.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

let audio: HTMLAudioElement | null = null;
let wavUrl: string | null = null;

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  wavUrl = silentWavUrl();
  const a = document.createElement('audio');
  a.src = wavUrl;
  a.loop = true;
  a.preload = 'auto';
  a.setAttribute('playsinline', '');
  a.setAttribute('webkit-playsinline', '');
  // Must NOT be muted — muted media gets no lock-screen controls.
  a.volume = 0.01;
  a.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0;';
  document.body.appendChild(a);
  return (audio = a);
}

function phaseBounds(phase: Phase, now: number): { duration: number; position: number } | null {
  if (phase.kind === 'work' || phase.kind === 'rest') {
    const duration = Math.max(0, (phase.endAt - phase.startedAt) / 1000);
    const position = Math.min(duration, Math.max(0, (now - phase.startedAt) / 1000));
    if (phase.kind === 'rest' && now >= phase.endAt) return null; // overtime: no bar
    return { duration, position };
  }
  if (phase.kind === 'ready') {
    const startedAt = phase.endAt - READY_SEC * 1000;
    const duration = READY_SEC;
    const position = Math.min(duration, Math.max(0, (now - startedAt) / 1000));
    return { duration, position };
  }
  return null;
}

function mediaTitle(view: PhaseView): string {
  if (view.key === 'over') return `${view.label} ${view.time}`;
  if (view.key === 'complete') return 'Done';
  if (view.key === 'idle') return view.label;
  return `${view.label} ${view.time}`;
}

interface Options {
  active: boolean;
  phase: Phase;
  view: PhaseView;
  dayName: string;
  now: number;
  onPrimary: () => void;
}

/**
 * While `active`, plays a looping silent audio track and publishes the current
 * phase timer via the Media Session API so it appears on the lock screen /
 * notification shade. Pauses the phone's music — keep opt-in.
 */
export function useLockScreenTimer({ active, phase, view, dayName, now, onPrimary }: Options): void {
  const onPrimaryRef = useRef(onPrimary);
  onPrimaryRef.current = onPrimary;
  const viewRef = useRef(view);
  viewRef.current = view;
  const activeRef = useRef(active);
  activeRef.current = active;

  // Start / stop silent audio when active flips.
  useEffect(() => {
    if (!active) {
      if (audio) {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = null;
          navigator.mediaSession.playbackState = 'none';
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const a = getAudio();
    const play = () => {
      void a.play().catch(() => {
        /* needs gesture — wait for pointerdown */
      });
    };
    play();

    const onGesture = () => {
      if (activeRef.current && a.paused) play();
    };
    window.addEventListener('pointerdown', onGesture);

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.setActionHandler('play', () => {
          void a.play().catch(() => {});
          try {
            navigator.mediaSession.playbackState = 'playing';
          } catch {
            /* ignore */
          }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          a.pause();
          try {
            navigator.mediaSession.playbackState = 'paused';
          } catch {
            /* ignore */
          }
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          const primary = viewRef.current.actions.find((x) => x.primary);
          if (primary && !primary.disabled) onPrimaryRef.current();
        });
        // Block seeking so the progress bar can't be dragged.
        navigator.mediaSession.setActionHandler('seekto', () => {});
        navigator.mediaSession.setActionHandler('seekbackward', () => {});
        navigator.mediaSession.setActionHandler('seekforward', () => {});
      } catch {
        /* unsupported handlers */
      }
    }

    return () => {
      window.removeEventListener('pointerdown', onGesture);
      a.pause();
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
          navigator.mediaSession.setActionHandler('seekto', null);
          navigator.mediaSession.setActionHandler('seekbackward', null);
          navigator.mediaSession.setActionHandler('seekforward', null);
          navigator.mediaSession.metadata = null;
          navigator.mediaSession.playbackState = 'none';
        } catch {
          /* ignore */
        }
      }
    };
  }, [active]);

  // Push metadata + position whenever the displayed second / phase changes.
  useEffect(() => {
    if (!active || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: mediaTitle(view),
        artist: view.title,
        album: dayName,
        artwork: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
      navigator.mediaSession.playbackState = audio && !audio.paused ? 'playing' : 'paused';

      const bounds = phaseBounds(phase, now);
      if (bounds && bounds.duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: bounds.duration,
          position: Math.min(bounds.position, bounds.duration),
          playbackRate: 1,
        });
      } else {
        // Clear the bar for overtime / idle / complete.
        try {
          navigator.mediaSession.setPositionState();
        } catch {
          /* some browsers require an object — ignore */
        }
      }
    } catch {
      /* Media Session unavailable or rejected */
    }
  }, [active, phase, view, dayName, now]);
}
