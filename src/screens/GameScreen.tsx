import { lazy, Suspense } from 'react';
import { useApp } from '../store/AppContext';
import { GameIdContext } from '../contexts/GameIdContext';

// Each game is a separate lazy chunk — only downloaded when first played.
const SnakeGame        = lazy(() => import('../games/SnakeGame').then(m => ({ default: m.SnakeGame })));
const Game2048         = lazy(() => import('../games/Game2048').then(m => ({ default: m.Game2048 })));
const MemoryMatch      = lazy(() => import('../games/MemoryMatch').then(m => ({ default: m.MemoryMatch })));
const TetrisGame       = lazy(() => import('../games/TetrisGame').then(m => ({ default: m.TetrisGame })));
const PongGame         = lazy(() => import('../games/PongGame').then(m => ({ default: m.PongGame })));
const FlappyGame       = lazy(() => import('../games/FlappyGame').then(m => ({ default: m.FlappyGame })));
const BreakoutGame     = lazy(() => import('../games/BreakoutGame').then(m => ({ default: m.BreakoutGame })));
const SpaceInvadersGame = lazy(() => import('../games/SpaceInvadersGame').then(m => ({ default: m.SpaceInvadersGame })));
const MinesweeperGame  = lazy(() => import('../games/MinesweeperGame').then(m => ({ default: m.MinesweeperGame })));
const Connect4Game     = lazy(() => import('../games/Connect4Game').then(m => ({ default: m.Connect4Game })));
const SudokuGame       = lazy(() => import('../games/SudokuGame').then(m => ({ default: m.SudokuGame })));
const AsteroidsGame    = lazy(() => import('../games/AsteroidsGame').then(m => ({ default: m.AsteroidsGame })));
const EndlessRunner    = lazy(() => import('../games/EndlessRunner').then(m => ({ default: m.EndlessRunner })));
const ChessGame        = lazy(() => import('../games/ChessGame').then(m => ({ default: m.ChessGame })));
const NeonBlobDash     = lazy(() => import('../games/NeonBlobDash').then(m => ({ default: m.NeonBlobDash })));

function GameLoadingSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 36 }}>🕹️</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
    </div>
  );
}

interface GameScreenProps {
  /** The game ID to render. When omitted falls back to state.activeGame (legacy). */
  gameId?: string;
}

export function GameScreen({ gameId: gameIdProp }: GameScreenProps) {
  const { state, navigate } = useApp();
  const gameId = gameIdProp ?? state.activeGame;

  let content: React.ReactNode;
  switch (gameId) {
    case 'snake':         content = <SnakeGame />; break;
    case 'tetris':        content = <TetrisGame />; break;
    case 'game2048':      content = <Game2048 />; break;
    case 'memory':        content = <MemoryMatch />; break;
    case 'pong':          content = <PongGame />; break;
    case 'flappy':        content = <FlappyGame />; break;
    case 'breakout':      content = <BreakoutGame />; break;
    case 'spaceinvaders': content = <SpaceInvadersGame />; break;
    case 'minesweeper':   content = <MinesweeperGame />; break;
    case 'connect4':      content = <Connect4Game />; break;
    case 'sudoku':        content = <SudokuGame />; break;
    case 'asteroids':     content = <AsteroidsGame />; break;
    case 'runner':        content = <EndlessRunner />; break;
    case 'chess':         content = <ChessGame />; break;
    case 'neonblob':      content = <NeonBlobDash />; break;
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
      <Suspense fallback={<GameLoadingSpinner />}>
        {content}
      </Suspense>
    </GameIdContext.Provider>
  );
}
