import { useEffect, useMemo, useRef, useState } from 'react';

type Ctx = AudioContext;

/**
 * Synthesised cues via Web Audio. Browsers only allow audio after a tap, so the
 * context is unlocked on the first tap/keypress (again after every page load).
 * `ready` says whether sound can currently play.
 */
export function useSound() {
  const ctxRef = useRef<Ctx | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unlock = () => {
      try {
        if (!ctxRef.current) {
          const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) return;
          const created = new AC();
          ctxRef.current = created;
          // iOS can suspend/interrupt audio (e.g. after the phone locks).
          created.addEventListener('statechange', () => setReady(created.state === 'running'));
        }
        if (ctxRef.current.state !== 'running') {
          const c = ctxRef.current;
          void c.resume().then(() => setReady(c.state === 'running'), () => {});
        } else setReady(true);
        // A silent buffer fully unlocks playback on iOS.
        const ctx = ctxRef.current;
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        /* no audio */
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const cues = useMemo(() => {
    const tone = (freq: number, durMs: number, delayMs = 0, gain = 0.25, type: OscillatorType = 'sine') => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + delayMs / 1000;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + durMs / 1000 + 0.02);
    };
    return {
      tick: () => tone(1200, 60, 0, 0.18, 'square'),
      go: () => tone(1500, 220, 0, 0.28, 'square'),
      beeps: (n = 3) => {
        for (let i = 0; i < n; i++) tone(880, 220, i * 320, 0.32, 'square');
      },
      done: () => {
        tone(660, 140, 0, 0.25);
        tone(990, 220, 150, 0.25);
      },
    };
  }, []);

  return { cues, ready };
}
