import { useApp } from '../store/AppContext';
import { SnakeGame } from '../games/SnakeGame';
import { Game2048 } from '../games/Game2048';
import { MemoryMatch } from '../games/MemoryMatch';
import { TetrisGame } from '../games/TetrisGame';
import { PongGame } from '../games/PongGame';
import { FlappyGame } from '../games/FlappyGame';
import { BreakoutGame } from '../games/BreakoutGame';
import { SpaceInvadersGame } from '../games/SpaceInvadersGame';
import { MinesweeperGame } from '../games/MinesweeperGame';
import { Connect4Game } from '../games/Connect4Game';
import { SudokuGame } from '../games/SudokuGame';
import { AsteroidsGame } from '../games/AsteroidsGame';
import { EndlessRunner } from '../games/EndlessRunner';
import { ChessGame } from '../games/ChessGame';
import { NeonBlobDash } from '../games/NeonBlobDash';

export function GameScreen() {
  const { state, navigate } = useApp();
  const gameId = state.activeGame;

  switch (gameId) {
    case 'snake': return <SnakeGame />;
    case 'tetris': return <TetrisGame />;
    case 'game2048': return <Game2048 />;
    case 'memory': return <MemoryMatch />;
    case 'pong': return <PongGame />;
    case 'flappy': return <FlappyGame />;
    case 'breakout': return <BreakoutGame />;
    case 'spaceinvaders': return <SpaceInvadersGame />;
    case 'minesweeper': return <MinesweeperGame />;
    case 'connect4': return <Connect4Game />;
    case 'sudoku': return <SudokuGame />;
    case 'asteroids': return <AsteroidsGame />;
    case 'runner': return <EndlessRunner />;
    case 'chess': return <ChessGame />;
    case 'neonblob': return <NeonBlobDash />;
    default:
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-2xl">🕹️</p>
          <p style={{ color: 'var(--text-muted)' }}>Game not found: {gameId}</p>
          <button onClick={() => navigate('menu')}
            className="px-6 py-2 rounded-xl pressable font-bold"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}>
            Back to Menu
          </button>
        </div>
      );
  }
}
