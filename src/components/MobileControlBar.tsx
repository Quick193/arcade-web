import React from 'react';

interface MobileControlItem {
  id: string;
  label: string;
  onPress: () => void;
  onRelease?: () => void;
  tone?: 'neutral' | 'accent' | 'danger';
  wide?: boolean;
  disabled?: boolean;
}

interface MobileControlBarProps {
  items: MobileControlItem[];
  hint?: string;
  /** 'dpad' arranges up/left/down/right items in a cross layout */
  layout?: 'row' | 'dpad';
}

/** Maps item id → CSS grid-area (row / column) for the 3×3 D-pad grid */
const DPAD_AREA: Record<string, string> = {
  up: '1 / 2', left: '2 / 1', down: '3 / 2', right: '2 / 3',
};

export function MobileControlBar({ items, hint, layout = 'row' }: MobileControlBarProps) {
  function renderButton(item: MobileControlItem, extra?: React.CSSProperties) {
    const palette = item.tone === 'accent'
      ? { bg: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', border: 'transparent', color: '#fff' }
      : item.tone === 'danger'
        ? { bg: 'rgba(239, 83, 80, 0.22)', border: 'rgba(239, 83, 80, 0.45)', color: '#ffd9d8' }
        : { bg: 'rgba(255,255,255,0.06)', border: 'var(--card-border)', color: 'var(--text-primary)' };

    return (
      <button
        key={item.id}
        type="button"
        disabled={item.disabled}
        onPointerDown={(event) => { event.preventDefault(); item.onPress(); }}
        onPointerUp={() => item.onRelease?.()}
        onPointerCancel={() => item.onRelease?.()}
        onPointerLeave={() => item.onRelease?.()}
        onContextMenu={(event) => event.preventDefault()}
        className="pressable h-12 rounded-2xl border text-sm font-black tracking-wide disabled:opacity-40"
        style={{
          background: palette.bg,
          borderColor: palette.border,
          color: palette.color,
          touchAction: 'none',
          ...extra,
        }}
      >
        {item.label}
      </button>
    );
  }

  if (layout === 'dpad') {
    return (
      <div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 56px)',
          gridTemplateRows: 'repeat(3, 48px)',
          gap: 6,
          margin: '0 auto',
          width: 'fit-content',
        }}>
          {items.map((item) =>
            renderButton(item, { gridArea: DPAD_AREA[item.id] ?? 'auto' })
          )}
        </div>
        {hint && (
          <div className="mt-2 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {hint}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, items.length))}, minmax(0, 1fr))` }}>
        {items.map((item) => renderButton(item, { gridColumn: item.wide ? 'span 2' : undefined }))}
      </div>
      {hint && (
        <div className="mt-2 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  );
}
