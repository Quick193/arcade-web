/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type {
  AppState,
  MountedGame,
  Settings,
  GameStats,
  Toast,
  Profile,
  PlayerProfile,
  DemoMode,
  DemoLearningTraits,
  GameDemoLearningProfile,
} from './types';
import { applyTheme } from './themes';
import { hapticHeavy, hapticSuccess } from '../utils/haptics';
import { setMusicEnabled } from '../utils/music';
import { ACHIEVEMENTS, getAchievementById } from './achievements';

const DEFAULT_STATS: GameStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  bestScore: 0,
  totalPlaytime: 0,
  currentStreak: 0,
  bestStreak: 0,
  topScores: [],
};

const DEFAULT_GLOBAL_STATS = { totalGames: 0, globalPlaytime: 0, firstPlay: null, lastPlay: null };

const DEFAULT_SETTINGS: Settings = {
  theme: 'modern_dark',
  showParticles: true,
  showFps: false,
  sfxEnabled: true,
  musicEnabled: false,
  showGhostPiece: true,
  chessShowHints: true,
};

const DEFAULT_DEMO_TRAITS: DemoLearningTraits = {
  tempo: 0.5,
  precision: 0.5,
  aggression: 0.5,
  risk: 0.5,
  exploration: 0.5,
};

function makeDefaultDemoLearning(): GameDemoLearningProfile {
  return {
    totalActions: 0,
    averageIntervalMs: 550,
    lastActionAt: null,
    actionCounts: {},
    traits: { ...DEFAULT_DEMO_TRAITS },
  };
}

function makeDefaultProfile(name = 'Player', avatarColor = '#5c86ff'): Profile {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `p_${Date.now()}`,
    name,
    avatarColor,
    stats: {},
    globalStats: { ...DEFAULT_GLOBAL_STATS },
    unlockedAchievements: [],
    gameDemoPreferences: {},
    gameDemoLearning: {},
    favoriteGameIds: [],
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    lastIncompleteGameId: null,
    hiddenFromRecents: [],
  };
}

const DEFAULT_PROFILE = makeDefaultProfile();

const INITIAL_STATE: AppState = {
  screen: 'menu',
  activeGame: null,
  mountedGames: [],
  gameInstanceCounter: 0,
  settings: DEFAULT_SETTINGS,
  profiles: [DEFAULT_PROFILE],
  activeProfileId: DEFAULT_PROFILE.id,
  toasts: [],
};

type Action =
  | { type: 'NAVIGATE'; screen: AppState['screen']; game?: string }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'MARK_GAME_INCOMPLETE'; gameId: string }
  | { type: 'DISMISS_FROM_RECENTS'; gameId: string }
  | { type: 'CLEAR_INCOMPLETE_GAME' }
  | { type: 'PAUSE_GAME'; started: boolean }
  | { type: 'UNMOUNT_GAME'; gameId: string }
  | { type: 'UPDATE_PROFILE'; patch: Partial<PlayerProfile> }
  | { type: 'SET_GAME_DEMO_MODE'; gameId: string; mode: DemoMode }
  | { type: 'RECORD_GAME_DEMO_ACTION'; gameId: string; action: string; traits?: Partial<DemoLearningTraits> }
  | { type: 'ADD_PROFILE'; name: string; avatarColor: string }
  | { type: 'SWITCH_PROFILE'; id: string }
  | { type: 'DELETE_PROFILE'; id: string }
  | { type: 'TOGGLE_FAVORITE_GAME'; gameId: string }
  | { type: 'RECORD_GAME'; gameId: string; won: boolean; score: number; duration: number }
  | { type: 'UNLOCK_ACHIEVEMENT'; id: string }
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'REMOVE_TOAST'; id: string }
  | { type: 'RESET_STATS' }
  | { type: 'RESET_ACHIEVEMENTS' }
  | { type: 'LOAD_STATE'; state: Partial<AppState> & { profile?: PlayerProfile; stats?: Record<string, GameStats>; globalStats?: typeof DEFAULT_GLOBAL_STATS; unlockedAchievements?: AppState['toasts'] } };

function getActiveProfile(state: AppState): Profile {
  return state.profiles.find(p => p.id === state.activeProfileId) ?? state.profiles[0];
}

function updateActiveProfile(state: AppState, updater: (p: Profile) => Profile): AppState {
  return {
    ...state,
    profiles: state.profiles.map(p => p.id === state.activeProfileId ? updater(p) : p),
  };
}

function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    gameDemoPreferences: profile.gameDemoPreferences ?? {},
    gameDemoLearning: profile.gameDemoLearning ?? {},
    favoriteGameIds: profile.favoriteGameIds ?? [],
    settings: profile.settings ?? { ...DEFAULT_SETTINGS },
    lastIncompleteGameId: profile.lastIncompleteGameId ?? null,
    hiddenFromRecents: profile.hiddenFromRecents ?? [],
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'NAVIGATE': {
      if (action.screen === 'game' && action.game) {
        const profile = getActiveProfile(state);
        const alreadyMounted = state.mountedGames.some(g => g.id === action.game);
        const isResume = profile.lastIncompleteGameId === action.game && alreadyMounted;

        if (isResume) {
          // Resume paused game — keep same React instance (no remount, state preserved)
          return { ...state, screen: 'game', activeGame: action.game };
        }
        // Fresh start — new instanceKey forces React to remount the component
        const newKey = state.gameInstanceCounter + 1;
        const mountedGames: MountedGame[] = [
          ...state.mountedGames.filter(g => g.id !== action.game),
          { id: action.game, instanceKey: newKey },
        ];
        return { ...state, screen: 'game', activeGame: action.game, mountedGames, gameInstanceCounter: newKey };
      }
      // Non-game screen: only change the screen, keep mountedGames/activeGame alive
      return { ...state, screen: action.screen };
    }

    case 'PAUSE_GAME': {
      const gameId = state.activeGame;
      if (action.started && gameId) {
        // Game was actually played — keep it mounted and mark as incomplete for Continue Playing
        return updateActiveProfile(
          { ...state, screen: 'menu' },
          p => ({ ...p, lastIncompleteGameId: gameId })
        );
      }
      // Game was never started — just unmount it silently
      const mountedGames = gameId ? state.mountedGames.filter(g => g.id !== gameId) : state.mountedGames;
      return { ...state, screen: 'menu', mountedGames };
    }

    case 'UNMOUNT_GAME': {
      const mountedGames = state.mountedGames.filter(g => g.id !== action.gameId);
      const activeGame = state.activeGame === action.gameId ? null : state.activeGame;
      return { ...state, mountedGames, activeGame, screen: 'menu' };
    }

    case 'UPDATE_SETTINGS': {
      const newSettings = { ...state.settings, ...action.patch };
      return updateActiveProfile(
        { ...state, settings: newSettings },
        p => ({ ...p, settings: { ...(p.settings ?? DEFAULT_SETTINGS), ...action.patch } })
      );
    }

    case 'MARK_GAME_INCOMPLETE':
      return updateActiveProfile(state, p => ({ ...p, lastIncompleteGameId: action.gameId }));

    case 'DISMISS_FROM_RECENTS':
      return updateActiveProfile(state, p => ({
        ...p,
        hiddenFromRecents: [...(p.hiddenFromRecents ?? []).filter(id => id !== action.gameId), action.gameId],
      }));

    case 'CLEAR_INCOMPLETE_GAME': {
      const incompleteId = getActiveProfile(state).lastIncompleteGameId;
      const mountedGames = incompleteId
        ? state.mountedGames.filter(g => g.id !== incompleteId)
        : state.mountedGames;
      return updateActiveProfile({ ...state, mountedGames }, p => ({ ...p, lastIncompleteGameId: null }));
    }

    case 'UPDATE_PROFILE':
      return updateActiveProfile(state, p => ({ ...p, ...action.patch }));

    case 'SET_GAME_DEMO_MODE':
      return updateActiveProfile(state, profile => ({
        ...profile,
        gameDemoPreferences: {
          ...profile.gameDemoPreferences,
          [action.gameId]: { mode: action.mode },
        },
      }));

    case 'RECORD_GAME_DEMO_ACTION':
      return updateActiveProfile(state, profile => {
        const prev = profile.gameDemoLearning[action.gameId] ?? makeDefaultDemoLearning();
        const now = Date.now();
        const prevTs = prev.lastActionAt ? Date.parse(prev.lastActionAt) : null;
        const interval = prevTs ? Math.max(16, now - prevTs) : prev.averageIntervalMs;
        const averageIntervalMs = prev.totalActions === 0
          ? interval
          : prev.averageIntervalMs * 0.82 + interval * 0.18;
        const tempoSample = action.traits?.tempo ?? Math.max(0, Math.min(1, 1 - (interval - 120) / 980));
        const nextTraits: DemoLearningTraits = {
          tempo: prev.traits.tempo * 0.85 + tempoSample * 0.15,
          precision: prev.traits.precision * 0.85 + (action.traits?.precision ?? prev.traits.precision) * 0.15,
          aggression: prev.traits.aggression * 0.85 + (action.traits?.aggression ?? prev.traits.aggression) * 0.15,
          risk: prev.traits.risk * 0.85 + (action.traits?.risk ?? prev.traits.risk) * 0.15,
          exploration: prev.traits.exploration * 0.85 + (action.traits?.exploration ?? prev.traits.exploration) * 0.15,
        };

        return {
          ...profile,
          gameDemoLearning: {
            ...profile.gameDemoLearning,
            [action.gameId]: {
              totalActions: prev.totalActions + 1,
              averageIntervalMs,
              lastActionAt: new Date(now).toISOString(),
              actionCounts: {
                ...prev.actionCounts,
                [action.action]: (prev.actionCounts[action.action] ?? 0) + 1,
              },
              traits: nextTraits,
            },
          },
        };
      });

    case 'ADD_PROFILE': {
      const newProfile = makeDefaultProfile(action.name, action.avatarColor);
      return { ...state, profiles: [...state.profiles, newProfile], activeProfileId: newProfile.id };
    }

    case 'SWITCH_PROFILE': {
      const switchTarget = state.profiles.find(p => p.id === action.id);
      if (!switchTarget) return state;
      return { ...state, activeProfileId: action.id, settings: switchTarget.settings ?? DEFAULT_SETTINGS };
    }

    case 'DELETE_PROFILE': {
      if (state.profiles.length <= 1) return state; // can't delete last profile
      const remaining = state.profiles.filter(p => p.id !== action.id);
      const newActiveId = state.activeProfileId === action.id ? remaining[0].id : state.activeProfileId;
      return { ...state, profiles: remaining, activeProfileId: newActiveId };
    }

    case 'TOGGLE_FAVORITE_GAME':
      return updateActiveProfile(state, profile => {
        const favoriteSet = new Set(profile.favoriteGameIds);
        if (favoriteSet.has(action.gameId)) favoriteSet.delete(action.gameId);
        else favoriteSet.add(action.gameId);
        return { ...profile, favoriteGameIds: Array.from(favoriteSet) };
      });

    case 'RECORD_GAME': {
      return updateActiveProfile(state, profile => {
        const prev = profile.stats[action.gameId] ?? { ...DEFAULT_STATS };
        const newStreak = action.won ? prev.currentStreak + 1 : 0;
        const newTopScores = [...prev.topScores, { score: action.score, date: new Date().toISOString() }]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);
        const updated: GameStats = {
          gamesPlayed: prev.gamesPlayed + 1,
          gamesWon: prev.gamesWon + (action.won ? 1 : 0),
          gamesLost: prev.gamesLost + (!action.won ? 1 : 0),
          bestScore: Math.max(prev.bestScore, action.score),
          totalPlaytime: prev.totalPlaytime + action.duration,
          currentStreak: newStreak,
          bestStreak: Math.max(prev.bestStreak, newStreak),
          topScores: newTopScores,
        };
        const global = profile.globalStats;
        return {
          ...profile,
          stats: { ...profile.stats, [action.gameId]: updated },
          globalStats: {
            totalGames: global.totalGames + 1,
            globalPlaytime: global.globalPlaytime + action.duration,
            firstPlay: global.firstPlay ?? new Date().toISOString(),
            lastPlay: new Date().toISOString(),
          },
          lastIncompleteGameId: null, // session completed — remove from Continue Playing
          hiddenFromRecents: (profile.hiddenFromRecents ?? []).filter(id => id !== action.gameId), // re-show after new session
        };
      });
    }

    case 'UNLOCK_ACHIEVEMENT': {
      return updateActiveProfile(state, profile => {
        if (profile.unlockedAchievements.find(a => a.id === action.id)) return profile;
        return {
          ...profile,
          unlockedAchievements: [
            ...profile.unlockedAchievements,
            { id: action.id, unlockedAt: new Date().toISOString() },
          ],
        };
      });
    }

    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] };

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };

    case 'RESET_STATS':
      return updateActiveProfile(state, p => ({ ...p, stats: {}, globalStats: { ...DEFAULT_GLOBAL_STATS } }));

    case 'RESET_ACHIEVEMENTS':
      return updateActiveProfile(state, p => ({ ...p, unlockedAchievements: [] }));

    case 'LOAD_STATE': {
      // Migrate old single-profile format to new multi-profile format
      const loaded = action.state as Record<string, unknown>;
      if (loaded.profiles) {
        // New format — just merge directly
        const next = { ...state, ...action.state as Partial<AppState> };
        return {
          ...next,
          profiles: (next.profiles ?? state.profiles).map(normalizeProfile),
        };
      }
      // Old format migration: build a profile from old flat stats
      const oldProfile = loaded.profile as PlayerProfile | undefined;
      const oldStats = loaded.stats as Record<string, GameStats> | undefined;
      const oldGlobalStats = loaded.globalStats as typeof DEFAULT_GLOBAL_STATS | undefined;
      const oldAchievements = loaded.unlockedAchievements as unknown[] | undefined;
      const migratedProfile = makeDefaultProfile(oldProfile?.name ?? 'Player', oldProfile?.avatarColor ?? '#5c86ff');
      if (oldStats) migratedProfile.stats = oldStats;
      if (oldGlobalStats) migratedProfile.globalStats = oldGlobalStats;
      if (oldAchievements) migratedProfile.unlockedAchievements = oldAchievements as Profile['unlockedAchievements'];
      const mergedState: AppState = {
        ...state,
        settings: (loaded.settings as Settings) ?? state.settings,
        profiles: [migratedProfile],
        activeProfileId: migratedProfile.id,
      };
      return mergedState;
    }

    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  navigate: (screen: AppState['screen'], game?: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateProfile: (patch: Partial<PlayerProfile>) => void;
  setGameDemoMode: (gameId: string, mode: DemoMode) => void;
  recordGameDemoAction: (gameId: string, action: string, traits?: Partial<DemoLearningTraits>) => void;
  addProfile: (name: string, avatarColor: string) => void;
  switchProfile: (id: string) => void;
  deleteProfile: (id: string) => void;
  toggleFavoriteGame: (gameId: string) => void;
  recordGame: (gameId: string, won: boolean, score: number, duration: number) => void;
  checkAchievements: (gameId: string, context: Record<string, unknown>) => void;
  bestScore: (gameId: string) => number;
  resetStats: () => void;
  resetAchievements: () => void;
  markGameIncomplete: (gameId: string) => void;
  /** Pause current game: if started=true, keeps it mounted and shows it in Continue Playing. */
  pauseGame: (started: boolean) => void;
  /** Unmount a game immediately (without pause) and return to menu. */
  unmountGame: (gameId: string) => void;
  dismissFromRecents: (gameId: string) => void;
  clearIncompleteGame: () => void;
  activeProfile: Profile;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = 'arcade_hub_state';

function loadFromStorage(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveToStorage(state: AppState) {
  try {
    const persist = {
      settings: state.settings,
      profiles: state.profiles,
      activeProfileId: state.activeProfileId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Load persisted state on mount
  useEffect(() => {
    const saved = loadFromStorage();
    if (Object.keys(saved).length > 0) {
      dispatch({ type: 'LOAD_STATE', state: saved });
      if ((saved as Record<string, unknown>).settings && ((saved as Record<string, unknown>).settings as Settings).theme) {
        applyTheme(((saved as Record<string, unknown>).settings as Settings).theme);
      } else {
        applyTheme(DEFAULT_SETTINGS.theme);
      }
    } else {
      applyTheme(DEFAULT_SETTINGS.theme);
    }
  }, []);

  // Debounce persistence so fast gameplay state updates do not hammer localStorage.
  useEffect(() => {
    const persistTimer = window.setTimeout(() => saveToStorage(state), 180);
    return () => window.clearTimeout(persistTimer);
  }, [state]);

  // Apply theme whenever it changes
  useEffect(() => {
    applyTheme(state.settings.theme);
  }, [state.settings.theme]);

  // Start/stop ambient music when the setting changes
  useEffect(() => {
    setMusicEnabled(state.settings.musicEnabled);
  }, [state.settings.musicEnabled]);

  const activeProfile = getActiveProfile(state);

  const navigate = useCallback((screen: AppState['screen'], game?: string) => {
    dispatch({ type: 'NAVIGATE', screen, game });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', patch });
  }, []);

  const updateProfile = useCallback((patch: Partial<PlayerProfile>) => {
    dispatch({ type: 'UPDATE_PROFILE', patch });
  }, []);

  const setGameDemoMode = useCallback((gameId: string, mode: DemoMode) => {
    dispatch({ type: 'SET_GAME_DEMO_MODE', gameId, mode });
  }, []);

  const recordGameDemoAction = useCallback((gameId: string, action: string, traits?: Partial<DemoLearningTraits>) => {
    dispatch({ type: 'RECORD_GAME_DEMO_ACTION', gameId, action, traits });
  }, []);

  const addProfile = useCallback((name: string, avatarColor: string) => {
    dispatch({ type: 'ADD_PROFILE', name, avatarColor });
  }, []);

  const switchProfile = useCallback((id: string) => {
    dispatch({ type: 'SWITCH_PROFILE', id });
  }, []);

  const deleteProfile = useCallback((id: string) => {
    dispatch({ type: 'DELETE_PROFILE', id });
  }, []);

  const toggleFavoriteGame = useCallback((gameId: string) => {
    dispatch({ type: 'TOGGLE_FAVORITE_GAME', gameId });
  }, []);

  const recordGame = useCallback((gameId: string, won: boolean, score: number, duration: number) => {
    hapticHeavy();
    dispatch({ type: 'RECORD_GAME', gameId, won, score, duration });
  }, []);

  const checkAchievements = useCallback((gameId: string, context: Record<string, unknown>) => {
    const profile = getActiveProfile(state);
    const unlocked = profile.unlockedAchievements.map(a => a.id);
    const gs = profile.globalStats;

    const checks: Array<{ id: string; condition: () => boolean }> = [
      { id: 'first_game', condition: () => (gs.totalGames + 1) >= 1 },
      { id: 'first_win', condition: () => context.won === true && !profile.unlockedAchievements.find(a => a.id === 'first_win') },
      { id: 'played_5', condition: () => (gs.totalGames + 1) >= 5 },
      { id: 'played_25', condition: () => (gs.totalGames + 1) >= 25 },
      { id: 'played_50', condition: () => (gs.totalGames + 1) >= 50 },
      { id: 'played_100', condition: () => (gs.totalGames + 1) >= 100 },
      { id: 'playtime_1h', condition: () => (gs.globalPlaytime + (context.duration as number ?? 0)) >= 3600 },
      { id: 'playtime_5h', condition: () => (gs.globalPlaytime + (context.duration as number ?? 0)) >= 18000 },
      { id: 'playtime_10h', condition: () => (gs.globalPlaytime + (context.duration as number ?? 0)) >= 36000 },
      // per-game
      { id: `${gameId}_first`, condition: () => (profile.stats[gameId]?.gamesPlayed ?? 0) === 0 },
      { id: `${gameId}_win`, condition: () => context.won === true },
      // snake
      { id: 'snake_100', condition: () => gameId === 'snake' && (context.score as number) >= 100 },
      { id: 'snake_500', condition: () => gameId === 'snake' && (context.score as number) >= 500 },
      // tetris
      { id: 'tetris_1000', condition: () => gameId === 'tetris' && (context.score as number) >= 1000 },
      { id: 'tetris_10000', condition: () => gameId === 'tetris' && (context.score as number) >= 10000 },
      { id: 'tetris_tetris', condition: () => gameId === 'tetris' && (context.tetris as boolean) === true },
      // 2048
      { id: '2048_1024', condition: () => gameId === 'game2048' && (context.maxTile as number) >= 1024 },
      { id: '2048_2048', condition: () => gameId === 'game2048' && (context.maxTile as number) >= 2048 },
      // memory
      { id: 'memory_perfect', condition: () => gameId === 'memory' && context.won === true && (context.errors as number) === 0 },
      // pong
      { id: 'pong_shutout', condition: () => gameId === 'pong' && context.won === true && (context.aiScore as number) === 0 },
      // flappy
      { id: 'flappy_10', condition: () => gameId === 'flappy' && (context.score as number) >= 10 },
      { id: 'flappy_50', condition: () => gameId === 'flappy' && (context.score as number) >= 50 },
      // space
      { id: 'space_wave3', condition: () => gameId === 'spaceinvaders' && (context.wave as number) >= 3 },
      { id: 'space_1000', condition: () => gameId === 'spaceinvaders' && (context.score as number) >= 1000 },
      // asteroids
      { id: 'asteroids_1000', condition: () => gameId === 'asteroids' && (context.score as number) >= 1000 },
      { id: 'asteroids_5000', condition: () => gameId === 'asteroids' && (context.score as number) >= 5000 },
      // runner
      { id: 'runner_500', condition: () => gameId === 'runner' && (context.score as number) >= 500 },
      { id: 'runner_2000', condition: () => gameId === 'runner' && (context.score as number) >= 2000 },
      // neon dash
      { id: 'neon_1000', condition: () => gameId === 'neonblob' && (context.score as number) >= 1000 },
      { id: 'neon_5000', condition: () => gameId === 'neonblob' && (context.score as number) >= 5000 },
      // sudoku
      { id: 'sudoku_hard', condition: () => gameId === 'sudoku' && context.won === true && context.difficulty === 'hard' },
      // explorer
      {
        id: 'played_5_games',
        condition: () => {
          const played = new Set(Object.keys(profile.stats).filter(k => (profile.stats[k]?.gamesPlayed ?? 0) > 0));
          played.add(gameId);
          return played.size >= 5;
        }
      },
      {
        id: 'played_all_games',
        condition: () => {
          const played = new Set(Object.keys(profile.stats).filter(k => (profile.stats[k]?.gamesPlayed ?? 0) > 0));
          played.add(gameId);
          return played.size >= 15;
        }
      },
    ];

    for (const check of checks) {
      if (!unlocked.includes(check.id) && ACHIEVEMENTS.find(a => a.id === check.id) && check.condition()) {
        hapticSuccess();
        dispatch({ type: 'UNLOCK_ACHIEVEMENT', id: check.id });
        const ach = getAchievementById(check.id);
        if (ach) {
          const toastId = `toast_${Date.now()}_${check.id}`;
          dispatch({
            type: 'ADD_TOAST',
            toast: {
              id: toastId,
              type: 'achievement',
              title: 'Achievement Unlocked!',
              message: ach.name,
              icon: ach.icon,
              color: ach.color,
            },
          });
          setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id: toastId }), 4000);
        }
      }
    }
  }, [state]);

  const bestScore = useCallback((gameId: string): number => {
    return getActiveProfile(state).stats[gameId]?.bestScore ?? 0;
  }, [state]);

  const resetStats = useCallback(() => dispatch({ type: 'RESET_STATS' }), []);
  const resetAchievements = useCallback(() => dispatch({ type: 'RESET_ACHIEVEMENTS' }), []);
  const markGameIncomplete = useCallback((gameId: string) => {
    dispatch({ type: 'MARK_GAME_INCOMPLETE', gameId });
  }, []);
  const pauseGame = useCallback((started: boolean) => {
    dispatch({ type: 'PAUSE_GAME', started });
  }, []);
  const unmountGame = useCallback((gameId: string) => {
    dispatch({ type: 'UNMOUNT_GAME', gameId });
  }, []);
  const dismissFromRecents = useCallback((gameId: string) => {
    dispatch({ type: 'DISMISS_FROM_RECENTS', gameId });
  }, []);
  const clearIncompleteGame = useCallback(() => {
    dispatch({ type: 'CLEAR_INCOMPLETE_GAME' });
  }, []);

  return (
    <AppContext.Provider value={{ state, navigate, updateSettings, updateProfile, setGameDemoMode, recordGameDemoAction, addProfile, switchProfile, deleteProfile, toggleFavoriteGame, recordGame, checkAchievements, bestScore, resetStats, resetAchievements, markGameIncomplete, pauseGame, unmountGame, dismissFromRecents, clearIncompleteGame, activeProfile }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
