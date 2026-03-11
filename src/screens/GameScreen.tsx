import { useApp } from '../store/AppContext';
import { GameIdContext } from '../contexts/GameIdContext';
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

interface GameScreenProps {
  /** The game ID to render. When omitted falls back to state.activeGame (legacy). */
  gameId?: string;
}

export function GameScreen({ gameId: gameIdProp }: GameScreenProps) {
  const { state, navigate } = useApp();
  const gameId = gameIdProp ?? state.activeGame;

  let content: React.ReactNode;
  switch (gameId) {
    case 'snake':        content = <SnakeGame />; break;
    case 'tetris':       content = <TetrisGame />; break;
    case 'game2048':     content = <Game2048 />; break;
    case 'memory':       content = <MemoryMatch />; break;
    case 'pong':         content = <PongGame />; break;
    case 'flappy':       content = <FlappyGame />; break;
    case 'breakout':     content = <BreakoutGame />; break;
    case 'spaceinvaders':content = <SpaceInvadersGame />; break;
    case 'minesweeper':  content = <MinesweeperGame />; break;
    case 'connect4':     content = <Connect4Game />; break;
    case 'sudoku':       content = <SudokuGame />; break;
    case 'asteroids':    content = <AsteroidsGame />; break;
    case 'runner':       content = <EndlessRunner />; break;
    case 'chess':        content = <ChessGame />; break;
    case 'neonblob':     content = <NeonBlobDash />; break;
    default:
      content = (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-2xl">🕹️</p>
          <p style={{ color: 'var(--text-muted)' }}>Game not found: {gameId}</p>
          <button
            onClick={() => navigate('menu')}
            className="px-6 py-2 rounded-xl pressable font-bold"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            Back to Menu
          </button>
        </div>
      );
  }

  return (
    <GameIdContext.Provider value={gameId ?? ''}>
      {content}
    </GameIdContext.Provider>
  );
}
