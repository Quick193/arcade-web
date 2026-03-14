export type ThemeName = 'modern_dark' | 'neon_cyber' | 'retro_crt' | 'minimal_light' | 'glass_ui';
export type Screen = 'menu' | 'game' | 'profile' | 'achievements' | 'settings';

export interface GameStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  bestScore: number;
  totalPlaytime: number; // seconds
  currentStreak: number;
  bestStreak: number;
  topScores: { score: number; date: string }[];
}

export interface GlobalStats {
  totalGames: number;
  globalPlaytime: number;
  firstPlay: string | null;
  lastPlay: string | null;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  points: number;
  secret?: boolean;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string;
}

export interface Settings {
  theme: ThemeName;
  showParticles: boolean;
  showFps: boolean;
  sfxEnabled: boolean;
  musicEnabled: boolean;
  showGhostPiece: boolean;
  chessShowHints: boolean;
}

export type DemoMode = 'off' | 'classic' | 'adaptive';

export interface GameDemoPreference {
  mode: DemoMode;
}

export interface DemoLearningTraits {
  tempo: number;
  precision: number;
  aggression: number;
  risk: number;
  exploration: number;
}

export interface GameDemoLearningProfile {
  totalActions: number;
  averageIntervalMs: number;
  lastActionAt: string | null;
  actionCounts: Record<string, number>;
  traits: DemoLearningTraits;
}

export interface Profile {
  id: string;
  name: string;
  avatarColor: string;
  stats: Record<string, GameStats>;
  globalStats: GlobalStats;
  unlockedAchievements: UnlockedAchievement[];
  gameDemoPreferences: Record<string, GameDemoPreference>;
  gameDemoLearning: Record<string, GameDemoLearningProfile>;
  favoriteGameIds: string[];
  createdAt: string;
  settings?: Settings;
  lastIncompleteGameId?: string | null;  // legacy — migrated to incompleteGameIds on load
  incompleteGameIds?: string[];
  hiddenFromRecents?: string[];
}

// Keep for backward compat during migration
export interface PlayerProfile {
  name: string;
  avatarColor: string;
}

export interface SavedGame {
  id: string;
  savedAt: string;
  label: string;
  setupMode: 'pvp' | 'ai';
  setupDifficulty?: 'easy' | 'medium' | 'hard';
  setupPlayerColor?: 'w' | 'b';
  setupTimeControl?: string;
  moveCount: number;
  gameResult: string | null;
  boardJson: string; // JSON of Board
  historyJson: string; // JSON of string[] (SAN moves)
  evalScore: number;
  fullStateJson: string; // JSON of entire ChessState
  isAnalysis?: boolean;
  analysisJson?: string;
}

export interface MountedGame {
  id: string;
  instanceKey: number; // changes on fresh start to force React remount
}

export interface AppState {
  screen: Screen;
  activeGame: string | null;
  /** Games currently kept alive in memory (for pause/resume). */
  mountedGames: MountedGame[];
  /** Monotonically-increasing counter used to generate unique instanceKeys. */
  gameInstanceCounter: number;
  settings: Settings;
  profiles: Profile[];
  activeProfileId: string;
  toasts: Toast[];
}

export interface Toast {
  id: string;
  type: 'achievement' | 'info';
  title: string;
  message: string;
  icon: string;
  color: string;
}
