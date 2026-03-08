import { useEffect, useRef } from 'react';

export function useGameLoop(onFrame: (dtMs: number, now: number) => void, enabled = true) {
  const callbackRef = useRef(onFrame);

  useEffect(() => {
    callbackRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;
    let lastTs = 0;

    const loop = (ts: number) => {
      const dtMs = lastTs === 0 ? 16.67 : Math.min(ts - lastTs, 50);
      lastTs = ts;
      callbackRef.current(dtMs, ts);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);
}
