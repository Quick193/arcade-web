import type { Achievement } from './types';

export const ACHIEVEMENTS: Achievement[] = [
  // Global
  { id: 'first_game', name: 'First Boot', description: 'Play your first game', icon: '🎮', color: '#5c86ff', points: 10 },
  { id: 'first_win', name: 'First Victory', description: 'Win your first game', icon: '🏆', color: '#ffa726', points: 15 },
  { id: 'played_5', name: 'Warming Up', description: 'Play 5 games total', icon: '🔥', color: '#ef5350', points: 10 },
  { id: 'played_25', name: 'Getting Serious', description: 'Play 25 games total', icon: '⚡', color: '#ffee58', points: 20 },
  { id: 'played_100', name: 'Arcade Veteran', description: 'Play 100 games total', icon: '🎖️', color: '#ffa726', points: 50 },
  { id: 'played_5_games', name: 'Explorer', description: 'Try 5 different games', icon: '🗺️', color: '#26c6da', points: 20 },
  { id: 'played_all_games', name: 'Completionist', description: 'Try all games', icon: '🌟', color: '#ffee58', points: 60 },
  { id: 'playtime_1h', name: 'Time Flies', description: 'Play for 1 hour total', icon: '⏰', color: '#ab47bc', points: 15 },
  { id: 'playtime_5h', name: 'Dedicated', description: 'Play for 5 hours total', icon: '🕐', color: '#7c4dff', points: 30 },

  // Snake
  { id: 'snake_first', name: 'Hisssss', description: 'Play Snake for the first time', icon: '🐍', color: '#66bb6a', points: 5 },
  { id: 'snake_100', name: 'Long Boi', description: 'Score 100 in Snake', icon: '🐍', color: '#66bb6a', points: 15 },
  { id: 'snake_500', name: 'Mega Snake', description: 'Score 500 in Snake', icon: '🐍', color: '#4caf50', points: 30 },

  // Tetris
  { id: 'tetris_first', name: 'Block Party', description: 'Play Tetris for the first time', icon: '🟦', color: '#5c86ff', points: 5 },
  { id: 'tetris_1000', name: 'Stacker', description: 'Score 1,000 in Tetris', icon: '🟦', color: '#5c86ff', points: 15 },
  { id: 'tetris_10000', name: 'Tetris Master', description: 'Score 10,000 in Tetris', icon: '🟦', color: '#26c6da', points: 40 },
  { id: 'tetris_tetris', name: 'TETRIS!', description: 'Clear 4 lines at once', icon: '💥', color: '#ffee58', points: 25, secret: true },

  // 2048
  { id: '2048_first', name: 'Power of Two', description: 'Play 2048 for the first time', icon: '🔢', color: '#ffa726', points: 5 },
  { id: '2048_1024', name: 'Half Way There', description: 'Reach 1024 in 2048', icon: '🔢', color: '#ffa726', points: 20 },
  { id: '2048_2048', name: 'The Limit', description: 'Reach 2048!', icon: '👑', color: '#ffee58', points: 50, secret: true },

  // Memory Match
  { id: 'memory_first', name: 'Memory Lane', description: 'Play Memory Match for the first time', icon: '🃏', color: '#26c6da', points: 5 },
  { id: 'memory_perfect', name: 'Photographic', description: 'Win Memory Match with 0 errors', icon: '🧠', color: '#ab47bc', points: 30, secret: true },

  // Pong
  { id: 'pong_first', name: 'Ping Pong', description: 'Play Pong for the first time', icon: '🏓', color: '#26c6da', points: 5 },
  { id: 'pong_win', name: 'Table Tennis Pro', description: 'Win a game of Pong', icon: '🏓', color: '#26c6da', points: 15 },
  { id: 'pong_shutout', name: 'Shutout', description: 'Win Pong without letting the AI score', icon: '🏓', color: '#ffee58', points: 30, secret: true },

  // Flappy Bird
  { id: 'flappy_first', name: 'Wings', description: 'Play Flappy Bird for the first time', icon: '🐦', color: '#ffa726', points: 5 },
  { id: 'flappy_10', name: 'Frequent Flyer', description: 'Pass 10 pipes in Flappy Bird', icon: '🐦', color: '#ffa726', points: 20 },
  { id: 'flappy_50', name: 'Ace Pilot', description: 'Pass 50 pipes in Flappy Bird', icon: '🦅', color: '#ffee58', points: 40, secret: true },

  // Breakout
  { id: 'breakout_first', name: 'Break It Down', description: 'Play Breakout for the first time', icon: '🧱', color: '#ef5350', points: 5 },
  { id: 'breakout_win', name: 'Demolisher', description: 'Clear a level in Breakout', icon: '🧱', color: '#ef5350', points: 20 },

  // Space Invaders
  { id: 'space_first', name: 'Cadet', description: 'Play Space Invaders for the first time', icon: '👾', color: '#5c86ff', points: 5 },
  { id: 'space_wave3', name: 'Wave Rider', description: 'Reach wave 3 in Space Invaders', icon: '👾', color: '#5c86ff', points: 25 },
  { id: 'space_1000', name: 'Space Ace', description: 'Score 1,000 in Space Invaders', icon: '🚀', color: '#26c6da', points: 30 },

  // Minesweeper
  { id: 'mine_first', name: 'Careful Now', description: 'Play Minesweeper for the first time', icon: '💣', color: '#ef5350', points: 5 },
  { id: 'mine_win', name: 'Defuser', description: 'Win a game of Minesweeper', icon: '💣', color: '#66bb6a', points: 25 },

  // Connect 4
  { id: 'connect4_first', name: 'Four Play', description: 'Play Connect 4 for the first time', icon: '🔴', color: '#ef5350', points: 5 },
  { id: 'connect4_win', name: 'Connected', description: 'Win a game of Connect 4', icon: '🔴', color: '#ffa726', points: 20 },

  // Sudoku
  { id: 'sudoku_first', name: 'Number Cruncher', description: 'Play Sudoku for the first time', icon: '🔢', color: '#5c86ff', points: 5 },
  { id: 'sudoku_win', name: 'Logic Master', description: 'Complete a Sudoku puzzle', icon: '🔢', color: '#26c6da', points: 25 },
  { id: 'sudoku_hard', name: 'Genius', description: 'Complete a Hard Sudoku puzzle', icon: '🧩', color: '#ffee58', points: 40, secret: true },

  // Asteroids
  { id: 'asteroids_first', name: 'Houston', description: 'Play Asteroids for the first time', icon: '☄️', color: '#ab47bc', points: 5 },
  { id: 'asteroids_1000', name: 'Asteroid Hunter', description: 'Score 1,000 in Asteroids', icon: '☄️', color: '#ab47bc', points: 25 },
  { id: 'asteroids_5000', name: 'Galaxy Brain', description: 'Score 5,000 in Asteroids', icon: '🌌', color: '#ffee58', points: 40, secret: true },
];

export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}
