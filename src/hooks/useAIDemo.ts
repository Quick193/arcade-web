import { useCallback, useEffect, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import type { DemoLearningTraits, DemoMode, GameDemoLearningProfile } from '../store/types';

const DEFAULT_LEARNING: GameDemoLearningProfile = {
  totalActions: 0,
  averageIntervalMs: 550,
  lastActionAt: null,
  actionCounts: {},
  traits: {
    tempo: 0.5,
    precision: 0.5,
    aggression: 0.5,
    risk: 0.5,
    exploration: 0.5,
  },
};

const MODE_ORDER: DemoMode[] = ['off', 'classic', 'adaptive'];

export interface AIController {
  mode: DemoMode;
  isEnabled: boolean;
  isAdaptive: boolean;
  learning: GameDemoLearningProfile;
  hasLearnedProfile: boolean;
  setMode: (mode: DemoMode) => void;
  cycleMode: () => void;
  recordPlayerAction: (action: string, traits?: Partial<DemoLearningTraits>) => void;
  getAdaptiveDelay: (baseMs: number, minFactor?: number, maxFactor?: number) => number;
  getActionWeight: (action: string) => number;
  getTraitValue: (trait: keyof DemoLearningTraits) => number;
}

export function useAIDemo(gameId: string): AIController {
  const { activeProfile, setGameDemoMode, recordGameDemoAction } = useApp();

  const mode = activeProfile.gameDemoPreferences[gameId]?.mode ?? 'off';
  const learning = activeProfile.gameDemoLearning[gameId] ?? DEFAULT_LEARNING;

  const setMode = useCallback((nextMode: DemoMode) => {
    setGameDemoMode(gameId, nextMode);
  }, [gameId, setGameDemoMode]);

  const cycleMode = useCallback(() => {
    const currentIndex = MODE_ORDER.indexOf(mode);
    setMode(MODE_ORDER[(currentIndex + 1) % MODE_ORDER.length]);
  }, [mode, setMode]);

  const recordPlayerAction = useCallback((action: string, traits?: Partial<DemoLearningTraits>) => {
    recordGameDemoAction(gameId, action, traits);
  }, [gameId, recordGameDemoAction]);

  const getAdaptiveDelay = useCallback((baseMs: number, minFactor = 0.7, maxFactor = 1.35) => {
    if (mode !== 'adaptive') return baseMs;
    const factor = Math.max(minFactor, Math.min(maxFactor, learning.averageIntervalMs / 550));
    return Math.round(baseMs * factor);
  }, [learning.averageIntervalMs, mode]);

  const actionTotal = useMemo(
    () => Object.values(learning.actionCounts).reduce((sum, count) => sum + count, 0),
    [learning.actionCounts]
  );
  const hasLearnedProfile = learning.totalActions >= 12;

  const getActionWeight = useCallback((action: string) => {
    if (mode !== 'adaptive' || actionTotal === 0) return 1;
    const share = (learning.actionCounts[action] ?? 0) / actionTotal;
    return 1 + share * 2.5;
  }, [actionTotal, learning.actionCounts, mode]);

  const getTraitValue = useCallback((trait: keyof DemoLearningTraits) => {
    if (mode !== 'adaptive') return 0.5;
    return learning.traits[trait];
  }, [learning.traits, mode]);

  useEffect(() => {
    if (!gameId || gameId === '__global__') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      recordPlayerAction(`key:${event.key.toLowerCase()}`);
    };

    const onPointerDown = () => {
      recordPlayerAction('pointer');
    };

    const onTouchStart = () => {
      recordPlayerAction('touch');
    };

    window.addEventListener('keydown', onKeyDown, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('touchstart', onTouchStart);
    };
  }, [gameId, recordPlayerAction]);

  return {
    mode,
    isEnabled: mode !== 'off',
    isAdaptive: mode === 'adaptive',
    learning,
    hasLearnedProfile,
    setMode,
    cycleMode,
    recordPlayerAction,
    getAdaptiveDelay,
    getActionWeight,
    getTraitValue,
  };
}
