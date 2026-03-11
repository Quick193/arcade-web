import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';
import type { DemoMode } from '../store/types';

function ExitConfirmSheet({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
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
          Leave game?
        </div>
        <div className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Your progress in this session won't be saved.
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
            style={{ background: 'var(--accent-red)', color: '#fff' }}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

interface GameWrapperProps {
  title: string;
  score?: number | string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  onRestart?: () => void;
  controls?: React.ReactNode;
  footer?: React.ReactNode;
}

// Re-export React so game files can use JSX without importing it directly
export { React };

export function GameWrapper({ title, score, extra, children, onRestart, controls, footer }: GameWrapperProps) {
  const { state, navigate, markGameIncomplete } = useApp();
  const gameId = state.activeGame;
  const [showDemoSheet, setShowDemoSheet] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const demo = useAIDemo(gameId ?? '__global__');

  const demoLabels: Record<DemoMode, string> = {
    off: 'Demo Off',
    classic: 'Classic AI',
    adaptive: 'Learn Me',
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      <div
        className="pt-safe px-4 pb-3 flex items-end gap-3 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--card-border)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--text-muted)' }}>Now Playing</div>
          <h2 className="truncate text-lg font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {extra}
          {score !== undefined && (
            <div className="rounded-2xl px-3 py-2 text-right" style={{ background: 'rgba(38, 198, 218, 0.12)', border: '1px solid rgba(38, 198, 218, 0.2)' }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>Score</div>
              <div className="font-black text-base" style={{ color: 'var(--accent-cyan)', minWidth: '56px' }}>
                {typeof score === 'number' ? score.toLocaleString() : score}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden relative px-3 py-3">
        {children}
      </div>

      <div className="px-3 pt-2 pb-safe flex-shrink-0" style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--card-border)' }}>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setShowExitConfirm(true)}
            className="pressable h-11 rounded-2xl text-sm font-black"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}
          >
            Hub
          </button>
          <button
            onClick={() => {
              if (gameId) markGameIncomplete(gameId);
              onRestart?.();
            }}
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

      {showExitConfirm && (
        <ExitConfirmSheet
          onConfirm={() => navigate('menu')}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}

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
