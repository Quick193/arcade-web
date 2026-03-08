interface GameOverlayProps {
  visible: boolean;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  scoreLabel?: string;
  score?: number | string;
  bestLabel?: string;
  best?: number | string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function GameOverlay({
  visible,
  eyebrow,
  title,
  subtitle,
  scoreLabel = 'Score',
  score,
  bestLabel = 'Best',
  best,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: GameOverlayProps) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4" style={{ background: 'rgba(8, 10, 18, 0.72)' }}>
      <div className="w-full max-w-xs rounded-[28px] border px-5 py-6 text-center shadow-2xl"
        style={{ background: 'rgba(20, 24, 38, 0.96)', borderColor: 'rgba(92, 134, 255, 0.24)' }}>
        {eyebrow && (
          <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--accent-cyan)' }}>
            {eyebrow}
          </div>
        )}
        <div className="mt-2 text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        {subtitle && (
          <div className="mt-2 text-sm leading-5" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </div>
        )}
        {(score !== undefined || best !== undefined) && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-left">
            <div className="rounded-2xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>{scoreLabel}</div>
              <div className="mt-1 text-lg font-black" style={{ color: 'var(--text-primary)' }}>{score ?? '-'}</div>
            </div>
            <div className="rounded-2xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>{bestLabel}</div>
              <div className="mt-1 text-lg font-black" style={{ color: 'var(--text-primary)' }}>{best ?? '-'}</div>
            </div>
          </div>
        )}
        <div className="mt-5 grid gap-2">
          <button
            onClick={onPrimary}
            className="pressable h-12 rounded-2xl text-sm font-black"
            style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', color: '#fff' }}
          >
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="pressable h-11 rounded-2xl text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
