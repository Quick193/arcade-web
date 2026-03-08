import type { ThemeName } from './types';

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentBlue: string;
  accentCyan: string;
  accentGreen: string;
  accentOrange: string;
  accentPink: string;
  accentPurple: string;
  accentYellow: string;
  accentRed: string;
  gradientFrom: string;
  gradientTo: string;
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  modern_dark: {
    bgPrimary: '#0f1117',
    bgSecondary: '#1a1d2e',
    cardBg: '#1e2236',
    cardBorder: '#2d3154',
    textPrimary: '#e8eaf6',
    textSecondary: '#9fa8da',
    textMuted: '#5c6bc0',
    accentBlue: '#5c86ff',
    accentCyan: '#26c6da',
    accentGreen: '#66bb6a',
    accentOrange: '#ffa726',
    accentPink: '#f06292',
    accentPurple: '#ab47bc',
    accentYellow: '#ffee58',
    accentRed: '#ef5350',
    gradientFrom: '#0f1117',
    gradientTo: '#1a1d2e',
  },
  neon_cyber: {
    bgPrimary: '#050510',
    bgSecondary: '#0a0a1f',
    cardBg: '#0d0d25',
    cardBorder: '#1a1a4e',
    textPrimary: '#e0f7fa',
    textSecondary: '#80deea',
    textMuted: '#37474f',
    accentBlue: '#00b0ff',
    accentCyan: '#00e5ff',
    accentGreen: '#69ff47',
    accentOrange: '#ff9100',
    accentPink: '#ff4081',
    accentPurple: '#ea80fc',
    accentYellow: '#ffff00',
    accentRed: '#ff1744',
    gradientFrom: '#050510',
    gradientTo: '#0a0a1f',
  },
  retro_crt: {
    bgPrimary: '#0a1a0a',
    bgSecondary: '#0d1f0d',
    cardBg: '#112211',
    cardBorder: '#1a3a1a',
    textPrimary: '#33ff33',
    textSecondary: '#22cc22',
    textMuted: '#115511',
    accentBlue: '#33aaff',
    accentCyan: '#33ffff',
    accentGreen: '#33ff33',
    accentOrange: '#ffaa33',
    accentPink: '#ff33aa',
    accentPurple: '#aa33ff',
    accentYellow: '#ffff33',
    accentRed: '#ff3333',
    gradientFrom: '#0a1a0a',
    gradientTo: '#0d1f0d',
  },
  minimal_light: {
    bgPrimary: '#f5f5f5',
    bgSecondary: '#ffffff',
    cardBg: '#ffffff',
    cardBorder: '#e0e0e0',
    textPrimary: '#212121',
    textSecondary: '#424242',
    textMuted: '#9e9e9e',
    accentBlue: '#1565c0',
    accentCyan: '#00838f',
    accentGreen: '#2e7d32',
    accentOrange: '#e65100',
    accentPink: '#ad1457',
    accentPurple: '#6a1b9a',
    accentYellow: '#f57f17',
    accentRed: '#b71c1c',
    gradientFrom: '#f5f5f5',
    gradientTo: '#eeeeee',
  },
  glass_ui: {
    bgPrimary: '#1a0a2e',
    bgSecondary: '#16213e',
    cardBg: 'rgba(255,255,255,0.07)',
    cardBorder: 'rgba(255,255,255,0.15)',
    textPrimary: '#ffffff',
    textSecondary: '#b0bec5',
    textMuted: '#546e7a',
    accentBlue: '#7c4dff',
    accentCyan: '#18ffff',
    accentGreen: '#69ff47',
    accentOrange: '#ffab40',
    accentPink: '#ff4081',
    accentPurple: '#e040fb',
    accentYellow: '#ffff00',
    accentRed: '#ff5252',
    gradientFrom: '#1a0a2e',
    gradientTo: '#0d3b6e',
  },
};

export function applyTheme(name: ThemeName) {
  const t = THEMES[name];
  const root = document.documentElement;
  root.style.setProperty('--bg-primary', t.bgPrimary);
  root.style.setProperty('--bg-secondary', t.bgSecondary);
  root.style.setProperty('--card-bg', t.cardBg);
  root.style.setProperty('--card-border', t.cardBorder);
  root.style.setProperty('--text-primary', t.textPrimary);
  root.style.setProperty('--text-secondary', t.textSecondary);
  root.style.setProperty('--text-muted', t.textMuted);
  root.style.setProperty('--accent-blue', t.accentBlue);
  root.style.setProperty('--accent-cyan', t.accentCyan);
  root.style.setProperty('--accent-green', t.accentGreen);
  root.style.setProperty('--accent-orange', t.accentOrange);
  root.style.setProperty('--accent-pink', t.accentPink);
  root.style.setProperty('--accent-purple', t.accentPurple);
  root.style.setProperty('--accent-yellow', t.accentYellow);
  root.style.setProperty('--accent-red', t.accentRed);
  root.style.setProperty('--gradient-from', t.gradientFrom);
  root.style.setProperty('--gradient-to', t.gradientTo);
}
