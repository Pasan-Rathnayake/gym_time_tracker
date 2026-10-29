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
  return `${view.label} · ${view.time}`;
}

const PHASE_COLOR: Record<string, string> = {
  work: '#ff7a2f',
  rest: '#4d97ff',
  over: '#4d97ff',
  ready: '#b9bcc2',
  complete: '#6dcf8a',
  idle: '#b9bcc2',
};

export interface LockScreenArt {
  name: string;
  /** 0-based current / next set index. */
  set: number;
  sets: number;
}

interface ArtworkInfo {
  phaseKey: string;
  phaseLabel: string;
  name: string;
  set: number;
  sets: number;
  dayName: string;
}

let artworkCacheKey = '';
let artworkCacheUrl = '';

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const trial = `${current} ${words[i]}`;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines - 1) {
        // Pack the rest onto the last line, truncating with an ellipsis if needed.
        let rest = words.slice(i).join(' ');
        while (rest.length > 1 && ctx.measureText(`${rest}…`).width > maxWidth) {
          rest = rest.slice(0, -1);
        }
        lines.push(ctx.measureText(rest).width <= maxWidth ? rest : `${rest}…`);
        return lines;
      }
    }
  }
  lines.push(current);
  return lines;
}

function renderArtwork(info: ArtworkInfo): string {
  const key = `${info.phaseKey}|${info.name}|${info.set}|${info.sets}|${info.dayName}`;
  if (key === artworkCacheKey && artworkCacheUrl) return artworkCacheUrl;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '/pwa-512.png';

  // Dark card background.
  ctx.fillStyle = '#121316';
  ctx.fillRect(0, 0, size, size);

  const pad = 48;
  const color = PHASE_COLOR[info.phaseKey] ?? '#b9bcc2';

  // Phase label.
  ctx.fillStyle = color;
  ctx.font = '600 36px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(info.phaseLabel.toUpperCase(), pad, pad);

  // Exercise name, up to 2 lines.
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 52px system-ui, -apple-system, sans-serif';
  const nameLines = wrapLines(ctx, info.name, size - pad * 2, 2);
  let y = pad + 64;
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += 64;
  }

  // Set dots: filled = done, ringed = current, empty = upcoming.
  if (info.sets > 0) {
    const dotR = 14;
    const gap = 28;
    let x = pad + dotR;
    const dotsY = size - pad - 72;
    for (let i = 0; i < info.sets; i++) {
      if (i < info.set) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, dotsY, dotR, 0, Math.PI * 2);
        ctx.fill();
      } else if (i === info.set) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, dotsY, dotR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, dotsY, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#3a3d44';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, dotsY, dotR, 0, Math.PI * 2);
        ctx.stroke();
      }
      x += dotR * 2 + gap;
    }
  }

  // Day name at the bottom.
  ctx.fillStyle = '#6b6e76';
  ctx.font = '500 28px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText(info.dayName, pad, size - pad + 4);

  const url = canvas.toDataURL('image/png');
  artworkCacheKey = key;
  artworkCacheUrl = url;
  return url;
}

interface Options {
  active: boolean;
  phase: Phase;
  view: PhaseView;
  dayName: string;
  now: number;
  art: LockScreenArt | null;
}

/**
 * While `active`, plays a looping silent audio track and publishes the current
 * phase timer via the Media Session API so it appears on the lock screen /
 * notification shade. Pauses the phone's music — keep opt-in.
 */
export function useLockScreenTimer({ active, phase, view, dayName, now, art }: Options): void {
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
    // If iOS pauses the element itself, snap playback back on so the session stays live.
    const onAudioPause = () => {
      if (activeRef.current) {
        play();
        try {
          navigator.mediaSession.playbackState = 'playing';
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('pointerdown', onGesture);
    a.addEventListener('pause', onAudioPause);

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
        // Pause is a no-op: immediately resume so the forced centre button does nothing.
        navigator.mediaSession.setActionHandler('pause', () => {
          void a.play().catch(() => {});
          try {
            navigator.mediaSession.playbackState = 'playing';
          } catch {
            /* ignore */
          }
        });
        // Block seeking so the progress bar can't be dragged.
        navigator.mediaSession.setActionHandler('seekto', () => {});
        // Clear skip / next handlers so ±10 controls don't appear (and to drop any prior registration).
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
      } catch {
        /* unsupported handlers */
      }
    }

    return () => {
      window.removeEventListener('pointerdown', onGesture);
      a.removeEventListener('pause', onAudioPause);
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('seekto', null);
          navigator.mediaSession.metadata = null;
          navigator.mediaSession.playbackState = 'none';
        } catch {
          /* ignore */
        }
      }
      // Pause after clearing handlers / the pause listener so auto-resume can't fight cleanup.
      a.pause();
    };
  }, [active]);

  // Push metadata + position whenever the displayed second / phase changes.
  useEffect(() => {
    if (!active || !('mediaSession' in navigator)) return;
    try {
      const artwork =
        art != null
          ? [
              {
                src: renderArtwork({
                  phaseKey: view.key,
                  phaseLabel: view.label,
                  name: art.name,
                  set: art.set,
                  sets: art.sets,
                  dayName,
                }),
                sizes: '512x512',
                type: 'image/png',
              },
            ]
          : [
              { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
            ];

      navigator.mediaSession.metadata = new MediaMetadata({
        title: mediaTitle(view),
        artist: view.title,
        album: dayName,
        artwork,
      });
      navigator.mediaSession.playbackState = 'playing';

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
  }, [active, phase, view, dayName, now, art]);
}
