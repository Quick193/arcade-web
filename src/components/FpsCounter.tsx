import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';

export function FpsCounter() {
  const { state } = useApp();
  const [fps, setFps] = useState(0);
  const frameTimesRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!state.settings.showFps) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;

      frameTimesRef.current.push(delta);
      // Keep a rolling 30-frame window
      if (frameTimesRef.current.length > 30) frameTimesRef.current.shift();

      const avg = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
      setFps(Math.round(1000 / avg));

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state.settings.showFps]);

  if (!state.settings.showFps) return null;

  const color = fps >= 55 ? '#66bb6a' : fps >= 30 ? '#ffa726' : '#ef5350';

  return (
    <div
      className="fixed bottom-0 left-0 z-50 px-2 py-0.5 text-[11px] font-mono font-bold pointer-events-none"
      style={{
        background: 'rgba(0,0,0,0.55)',
        color,
        borderTopRightRadius: '6px',
        paddingBottom: 'max(env(safe-area-inset-bottom), 4px)',
      }}
    >
      {fps} FPS
    </div>
  );
}
