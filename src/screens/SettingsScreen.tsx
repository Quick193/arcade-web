import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { THEMES } from '../store/themes';
import type { ThemeName } from '../store/types';

const THEME_LABELS: Record<ThemeName, string> = {
  modern_dark: '🌑 Modern Dark',
  neon_cyber: '⚡ Neon Cyber',
  retro_crt: '📺 Retro CRT',
  minimal_light: '☀️ Minimal Light',
  glass_ui: '💎 Glass UI',
};

export function SettingsScreen() {
  const { state, navigate, updateSettings, resetStats, resetAchievements } = useApp();
  const [confirmReset, setConfirmReset] = useState<'stats' | 'achievements' | null>(null);

  const s = state.settings;

  return (
    <div className="flex flex-col h-full screen-enter" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="pt-safe px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--card-border)' }}>
        <button onClick={() => navigate('menu')} className="pressable text-xl">←</button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h1>
      </div>

      <div className="flex-1 scrollable px-4 py-4 flex flex-col gap-4">

        {/* Theme */}
        <Section title="Appearance">
          <div className="px-4 py-3">
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Theme</p>
            <div className="flex flex-col gap-2">
              {(Object.keys(THEMES) as ThemeName[]).map(theme => (
                <button
                  key={theme}
                  onClick={() => updateSettings({ theme })}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg pressable border"
                  style={{
                    background: s.theme === theme ? 'var(--accent-blue)22' : 'var(--bg-primary)',
                    borderColor: s.theme === theme ? 'var(--accent-blue)' : 'var(--card-border)',
                  }}
                >
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {THEME_LABELS[theme]}
                  </span>
                  {s.theme === theme && <span className="text-accent-blue text-sm">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <ToggleRow
            label="Show Particles"
            description="Animated background particles on menu"
            value={s.showParticles}
            onChange={v => updateSettings({ showParticles: v })}
          />
          <ToggleRow
            label="Show FPS"
            description="Display frame rate counter"
            value={s.showFps}
            onChange={v => updateSettings({ showFps: v })}
          />
        </Section>

        {/* Audio */}
        <Section title="Audio">
          <ToggleRow
            label="Sound Effects"
            description="In-game sound effects"
            value={s.sfxEnabled}
            onChange={v => updateSettings({ sfxEnabled: v })}
          />
          <ToggleRow
            label="Music"
            description="Background music (coming soon)"
            value={s.musicEnabled}
            onChange={v => updateSettings({ musicEnabled: v })}
          />
        </Section>

        {/* Gameplay */}
        <Section title="Gameplay">
          <ToggleRow
            label="Ghost Piece"
            description="Show where Tetris pieces will land"
            value={s.showGhostPiece}
            onChange={v => updateSettings({ showGhostPiece: v })}
          />
          <ToggleRow
            label="Chess Hints"
            description="Highlight valid moves in Chess"
            value={s.chessShowHints}
            onChange={v => updateSettings({ chessShowHints: v })}
          />
        </Section>

        <Section title="AI Demo">
          <div className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            AI demo is now controlled per game from the game header. Each game can use `Off`, `Classic AI`, or `Learn Me` without affecting the others.
          </div>
        </Section>

        {/* Data */}
        <Section title="Data">
          <div className="px-4 py-3 flex flex-col gap-2">
            <button
              onClick={() => setConfirmReset('stats')}
              className="w-full py-2.5 rounded-lg text-sm font-semibold pressable border"
              style={{ color: 'var(--accent-orange)', borderColor: 'var(--accent-orange)44', background: 'var(--accent-orange)11' }}
            >
              Reset All Stats
            </button>
            <button
              onClick={() => setConfirmReset('achievements')}
              className="w-full py-2.5 rounded-lg text-sm font-semibold pressable border"
              style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)44', background: 'var(--accent-red)11' }}
            >
              Reset Achievements
            </button>
          </div>
        </Section>

        {/* About */}
        <Section title="About">
          <div className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            <p>Arcade Hub v1.0</p>
            <p className="mt-1">15 classic games, built for mobile.</p>
          </div>
        </Section>

      </div>

      {/* Confirm Dialog */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setConfirmReset(null)}>
          <div
            className="card p-6 w-full max-w-xs animate-bounce-in"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-bold text-base mb-2" style={{ color: 'var(--text-primary)' }}>
              {confirmReset === 'stats' ? 'Reset All Stats?' : 'Reset Achievements?'}
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              This cannot be undone. All {confirmReset === 'stats' ? 'game statistics' : 'unlocked achievements'} will be erased.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReset(null)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold pressable"
                style={{ background: 'var(--card-border)', color: 'var(--text-primary)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmReset === 'stats') resetStats();
                  else resetAchievements();
                  setConfirmReset(null);
                }}
                className="flex-1 py-2 rounded-lg text-sm font-bold pressable"
                style={{ background: 'var(--accent-red)', color: '#fff' }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h2>
      <div className="card flex flex-col divide-y" style={{ borderColor: 'var(--card-border)' }}>
        {children}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      className="flex items-center justify-between px-4 py-3 w-full text-left pressable"
      onClick={() => onChange(!value)}
    >
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{description}</p>
      </div>
      <div
        className="w-11 h-6 rounded-full flex items-center transition-all flex-shrink-0 ml-4"
        style={{ background: value ? 'var(--accent-blue)' : 'var(--card-border)' }}
      >
        <div
          className="w-5 h-5 rounded-full bg-white shadow-sm transition-transform mx-0.5"
          style={{ transform: value ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </div>
    </button>
  );
}
