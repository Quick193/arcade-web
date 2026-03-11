import { useEffect, useRef, useContext } from 'react';
import { useApp } from '../store/AppContext';
import { GameIdContext } from '../contexts/GameIdContext';

export function useGameLoop(onFrame: (dtMs: number, now: number) => void, enabled = true) {
  const callbackRef = useRef(onFrame);
  const { state } = useApp();
  const gameId = useContext(GameIdContext);

  useEffect(() => {
    callbackRef.current = onFrame;
  }, [onFrame]);

  // This game's loop should run only when it is the actively-displayed game.
  // When the game is mounted-but-hidden (display:none), we skip the callback
  // but keep the RAF alive so resuming is instant with no dt spike.
  const isActive = state.screen === 'game' && (!gameId || gameId === state.activeGame);
  const isPausedRef = useRef(!isActive);
  useEffect(() => {
    isPausedRef.current = !isActive;
  }, [isActive]);

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;
    let lastTs = 0;

    const loop = (ts: number) => {
      if (!isPausedRef.current) {
        const dtMs = lastTs === 0 ? 16.67 : Math.min(ts - lastTs, 50);
        lastTs = ts;
        callbackRef.current(dtMs, ts);
      } else {
        // Game is paused / hidden — reset lastTs so dt doesn't spike on resume
        lastTs = 0;
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);
}
