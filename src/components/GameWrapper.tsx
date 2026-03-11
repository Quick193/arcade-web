import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { useApp } from '../store/AppContext';
import { GameIdContext } from '../contexts/GameIdContext';
import { useAIDemo } from '../hooks/useAIDemo';
import type { DemoMode } from '../store/types';

// Re-export React so game files can use JSX without importing it directly
export { React };

// ---------------------------------------------------------------------------
// Exit / Pause confirmation sheet
// ---------------------------------------------------------------------------

interface ExitSheetProps {
  title: string;
  body: string;
  confirmLabel: string;
  confirmStyle?: React.CSSProperties;
  onConfirm: () => void;
  onCancel: () => void;
}

function ExitConfirmSheet({ title, body, confirmLabel, confirmStyle, onConfirm, onCancel }: ExitSheetProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-sm p-4 pb-safe animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        <div className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          {body}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="pressable h-11 rounded-2xl text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
          >
            Keep Playing
          </button>
          <button
            onClick={onConfirm}
            className="pressable h-11 rounded-2xl text-sm font-black"
            style={confirmStyle ?? { background: 'var(--accent-blue)', color: '#fff' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GameWrapper
// ---------------------------------------------------------------------------

interface GameWrapperProps {
  title: string;
  score?: number | string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  onRestart?: () => void;
  controls?: React.ReactNode;
  footer?: React.ReactNode;
}

export function GameWrapper({ title, score, extra, children, onRestart, controls, footer }: GameWrapperProps) {
  const { state, pauseGame, unmountGame, activeProfile } = useApp();
  const gameId = useContext(GameIdContext);

  const [showDemoSheet, setShowDemoSheet] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const demo = useAIDemo(gameId || '__global__');

  // --- Track whether the player has actually interacted with this game ------
  // This prevents the pause dialog appearing when Hub is pressed before the
  // player has done anything (e.g. on a "Start Wave" / "Tap to start" screen).
  const gameStartedRef = useRef(false);
  const gameAreaRef = useRef<HTMLDivElement>(null);

  // Capture-phase pointerdown fires before any stopPropagation in children
  // (e.g. Chess calls stopPropagation on its board overlays).
  useEffect(() => {
    const el = gameAreaRef.current;
    if (!el) return;
    const handler = () => { gameStartedRef.current = true; };
    el.addEventListener('pointerdown', handler, { capture: true });
    return () => el.removeEventListener('pointerdown', handler, { capture: true });
  }, []);

  // --- Detect game-over by watching gamesPlayed increment ------------------
  const prevGamesPlayedRef = useRef(activeProfile.stats[gameId]?.gamesPlayed ?? 0);
  const gameOverRef = useRef(false);

  useEffect(() => {
    const current = activeProfile.stats[gameId]?.gamesPlayed ?? 0;
    if (current > prevGamesPlayedRef.current) {
      gameOverRef.current = true;
    }
    prevGamesPlayedRef.current = current;
  }, [activeProfile.stats, gameId]);

  // Whether this game was previously paused (has saved state worth keeping)
  const wasPreviouslyPaused = activeProfile.lastIncompleteGameId === gameId;

  // Is this game the currently visible active game?
  const isActiveGame = state.screen === 'game' && state.activeGame === gameId;

  // --- Hub button logic ----------------------------------------------------
  const handleHubPress = useCallback(() => {
    if (gameOverRef.current) {
      // Game already over — just leave
      unmountGame(gameId);
      return;
    }
    if (!onRestart) {
      // Pre-game config/menu screen — leave silently
      unmountGame(gameId);
      return;
    }
    if (!gameStartedRef.current && !wasPreviouslyPaused) {
      // Active game phase, but player hasn't touched it yet (e.g. "tap to start"
      // overlay is still showing) — leave silently, nothing to save
      unmountGame(gameId);
      return;
    }
    // Player has started playing — offer to pause & save
    setShowExitConfirm(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRestart, gameId, unmountGame, wasPreviouslyPaused]);

  const handlePauseConfirm = () => {
    pauseGame(true); // marks as incomplete, keeps in memory, goes to menu
    setShowExitConfirm(false);
  };

  // --- Keyboard: any key = game started; Escape = Hub ---------------------
  useEffect(() => {
    if (!isActiveGame) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleHubPress();
      } else {
        // Any other key while the game is active means the player is playing
        gameStartedRef.current = true;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isActiveGame, handleHubPress]);

  // --- Restart -------------------------------------------------------------
  const handleRestart = () => {
    // Keep gameStartedRef true — player is actively restarting
    gameOverRef.current = false;
    prevGamesPlayedRef.current = activeProfile.stats[gameId]?.gamesPlayed ?? 0;
    onRestart?.();
  };

  const demoLabels: Record<DemoMode, string> = {
    off: 'Demo Off',
    classic: 'Classic AI',
    adaptive: 'Learn Me',
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="pt-safe px-4 pb-3 flex items-end gap-3 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--card-border)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--text-muted)' }}>
            Now Playing
          </div>
          <h2 className="truncate text-lg font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {extra}
          {score !== undefined && (
            <div
              className="rounded-2xl px-3 py-2 text-right"
              style={{ background: 'rgba(38, 198, 218, 0.12)', border: '1px solid rgba(38, 198, 218, 0.2)' }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                Score
              </div>
              <div className="font-black text-base" style={{ color: 'var(--accent-cyan)', minWidth: '56px' }}>
                {typeof score === 'number' ? score.toLocaleString() : score}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Game area — capture-phase listener on this div tracks first interaction */}
      <div
        ref={gameAreaRef}
        className="flex-1 flex items-center justify-center overflow-hidden relative px-3 py-3"
      >
        {children}
      </div>

      {/* Footer controls */}
      <div
        className="px-3 pt-2 pb-safe flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--card-border)' }}
      >
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleHubPress}
            className="pressable h-11 rounded-2xl text-sm font-black"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}
          >
            Hub
          </button>
          <button
            onClick={handleRestart}
            disabled={!onRestart}
            className="pressable h-11 rounded-2xl text-sm font-black disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}
          >
            Restart
          </button>
          {gameId ? (
            <button
              onClick={() => setShowDemoSheet(true)}
              className="pressable h-11 rounded-2xl text-sm font-black"
              style={{
                background: demo.mode === 'adaptive'
                  ? 'rgba(38, 198, 218, 0.16)'
                  : demo.mode === 'classic'
                    ? 'rgba(92, 134, 255, 0.16)'
                    : 'rgba(255,255,255,0.06)',
                color: demo.mode === 'off' ? 'var(--text-primary)' : 'var(--accent-cyan)',
                border: '1px solid var(--card-border)',
              }}
            >
              {demo.mode === 'off' ? 'Demo Off' : demo.mode === 'classic' ? 'Classic AI' : 'Learn Me'}
            </button>
          ) : (
            <div />
          )}
        </div>
        {controls && <div className="mt-2">{controls}</div>}
        {footer && <div className="mt-2">{footer}</div>}
      </div>

      {/* Pause confirmation sheet */}
      {showExitConfirm && (
        <ExitConfirmSheet
          title="Pause game?"
          body="Your game will be paused. Resume it any time from Continue Playing on the main menu."
          confirmLabel="Pause & Leave"
          confirmStyle={{ background: 'var(--accent-blue)', color: '#fff' }}
          onConfirm={handlePauseConfirm}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}

      {/* AI Demo sheet */}
      {showDemoSheet && gameId && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowDemoSheet(false)}
        >
          <div
            className="card w-full max-w-sm p-4 pb-safe animate-bounce-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>AI Demo</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Pick a demo mode for this game only. Learn Me keeps the existing demo and adds a second mode that adapts to your play rhythm and control tendencies.
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {(['off', 'classic', 'adaptive'] as DemoMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    demo.setMode(mode);
                    setShowDemoSheet(false);
                  }}
                  className="pressable rounded-xl border px-3 py-3 text-left"
                  style={{
                    borderColor: demo.mode === mode ? 'var(--accent-blue)' : 'var(--card-border)',
                    background: demo.mode === mode ? 'var(--accent-blue)22' : 'var(--bg-primary)',
                  }}
                >
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{demoLabels[mode]}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {mode === 'off'
                      ? 'Play manually.'
                      : mode === 'classic'
                        ? 'Use the built-in AI demo already in the game.'
                        : `Adapt demo pace and action bias from your local play history (${demo.learning.totalActions} samples).`}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
