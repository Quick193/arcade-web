import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';

const ROWS = 6, COLS = 7;
type Cell = 0 | 1 | 2; // 0=empty, 1=player1(red), 2=player2(yellow/AI)
type Board = Cell[][];

function makeBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as Cell[]);
}

function dropPiece(board: Board, col: number, player: 1 | 2): Board | null {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      const nb = board.map(row => [...row]) as Board;
      nb[r][col] = player;
      return nb;
    }
  }
  return null; // column full
}

function checkWin(board: Board, player: Cell): [number, number][] | null {
  // Returns winning cells or null
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c] !== player) continue;
    for (const [dr, dc] of dirs) {
      const cells: [number, number][] = [[r, c]];
      for (let k = 1; k < 4; k++) {
        const nr = r + dr * k, nc = c + dc * k;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
        cells.push([nr, nc]);
      }
      if (cells.length === 4) return cells;
    }
  }
  return null;
}

function isDraw(board: Board): boolean {
  return board[0].every(c => c !== 0);
}

function getAvailableCols(board: Board): number[] {
  return Array.from({ length: COLS }, (_, i) => i).filter(c => board[0][c] === 0);
}

function scoreWindow(window: Cell[], player: Cell): number {
  const opp = player === 1 ? 2 : 1;
  const p = window.filter(c => c === player).length;
  const o = window.filter(c => c === opp).length;
  const e = window.filter(c => c === 0).length;
  if (p === 4) return 100;
  if (p === 3 && e === 1) return 10;
  if (p === 2 && e === 2) return 3;
  if (o === 3 && e === 1) return -8;
  if (o === 2 && e === 2) return -1;
  return 0;
}

function evaluateBoard(board: Board, player: Cell): number {
  let score = 0;
  // Center column preference (stronger weight for control)
  for (let r = 0; r < ROWS; r++) {
    if (board[r][3] === player) score += 4;
    if (board[r][2] === player || board[r][4] === player) score += 2;
  }

  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      score += scoreWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]], player);
    }
  }
  // Vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      score += scoreWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]], player);
    }
  }
  // Diagonal down-right
  for (let r = 0; r <= ROWS - 4; r++) for (let c = 0; c <= COLS - 4; c++) {
    score += scoreWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]], player);
  }
  // Diagonal down-left
  for (let r = 0; r <= ROWS - 4; r++) for (let c = 3; c < COLS; c++) {
    score += scoreWindow([board[r][c], board[r + 1][c - 1], board[r + 2][c - 2], board[r + 3][c - 3]], player);
  }
  return score;
}

function minimax(board: Board, depth: number, alpha: number, beta: number, isMax: boolean, aiPlayer: 1 | 2): number {
  const humanPlayer: 1 | 2 = aiPlayer === 2 ? 1 : 2;
  if (checkWin(board, aiPlayer)) return 10000 + depth;
  if (checkWin(board, humanPlayer)) return -(10000 + depth);
  if (isDraw(board) || depth === 0) return evaluateBoard(board, aiPlayer);

  const cols = getAvailableCols(board);
  if (isMax) {
    let best = -Infinity;
    for (const c of cols) {
      const nb = dropPiece(board, c, aiPlayer)!;
      best = Math.max(best, minimax(nb, depth - 1, alpha, beta, false, aiPlayer));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const c of cols) {
      const nb = dropPiece(board, c, humanPlayer)!;
      best = Math.min(best, minimax(nb, depth - 1, alpha, beta, true, aiPlayer));
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return best;
  }
}

function getBestMove(board: Board, depth: number, aiPlayer: 1 | 2): number {
  const humanPlayer: 1 | 2 = aiPlayer === 2 ? 1 : 2;
  const cols = getAvailableCols(board);

  // Immediate win check: take it if available
  for (const c of cols) {
    const nb = dropPiece(board, c, aiPlayer);
    if (nb && checkWin(nb, aiPlayer)) return c;
  }
  // Immediate block check: block opponent's winning move
  for (const c of cols) {
    const nb = dropPiece(board, c, humanPlayer);
    if (nb && checkWin(nb, humanPlayer)) return c;
  }

  // Full minimax search
  let bestScore = -Infinity, bestCol = cols[0];
  // Shuffle for variety among equal moves
  const shuffled = [...cols].sort(() => Math.random() - 0.5);
  for (const c of shuffled) {
    const nb = dropPiece(board, c, aiPlayer)!;
    const s = minimax(nb, depth - 1, -Infinity, Infinity, false, aiPlayer);
    if (s > bestScore) { bestScore = s; bestCol = c; }
  }
  return bestCol;
}

function getAdaptiveMove(
  board: Board,
  depth: number,
  aiPlayer: 1 | 2,
  getActionWeight: (action: string) => number
): number {
  const humanPlayer: 1 | 2 = aiPlayer === 2 ? 1 : 2;
  const cols = getAvailableCols(board);

  for (const c of cols) {
    const nb = dropPiece(board, c, aiPlayer);
    if (nb && checkWin(nb, aiPlayer)) return c;
  }
  for (const c of cols) {
    const nb = dropPiece(board, c, humanPlayer);
    if (nb && checkWin(nb, humanPlayer)) return c;
  }

  let bestCol = cols[0];
  let bestRank = -Infinity;
  for (const c of cols) {
    const nb = dropPiece(board, c, aiPlayer)!;
    const score = minimax(nb, depth - 1, -Infinity, Infinity, false, aiPlayer);
    const centerBias = 3 - Math.abs(3 - c);
    const rank = score + centerBias * 0.8 + getActionWeight(`col:${c}`) * 2.6;
    if (rank > bestRank) {
      bestRank = rank;
      bestCol = c;
    }
  }
  return bestCol;
}

type GameMode = '1p' | '2p';
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFF_DEPTH: Record<Difficulty, number> = { easy: 2, medium: 4, hard: 7 };

interface GS {
  board: Board;
  turn: 1 | 2;
  winner: Cell | null;
  winCells: [number, number][] | null;
  draw: boolean;
  score: [number, number];
  history: Board[];
  aiThinking: boolean;
  aiDisabled: boolean;
}

export function Connect4Game() {
  const { recordGame, bestScore } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, getAdaptiveDelay, getActionWeight, recordPlayerAction } = useAIDemo('connect4');
  const aiDemoRef = useRef(aiDemoMode);
  aiDemoRef.current = aiDemoMode;

  const [mode, setMode] = useState<GameMode>('1p');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [configured, setConfigured] = useState(false);
  const startTimeRef = useRef(Date.now());
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initGs = useCallback((): GS => ({
    board: makeBoard(),
    turn: 1,
    winner: null,
    winCells: null,
    draw: false,
    score: [0, 0],
    history: [],
    aiThinking: false,
    aiDisabled: false,
  }), []);

  const [gs, setGs] = useState<GS>(initGs);

  const doMove = useCallback((col: number, player?: 1 | 2) => {
    setGs(prev => {
      if (prev.winner || prev.draw || prev.aiThinking) return prev;
      const p = player ?? prev.turn;
      if (p !== prev.turn) return prev;
      const nb = dropPiece(prev.board, col, p);
      if (!nb) return prev;
      const winCells = checkWin(nb, p);
      const draw = !winCells && isDraw(nb);
      const newScore: [number, number] = [...prev.score] as [number, number];
      if (winCells) newScore[p - 1]++;
      const newHistory = [...prev.history, prev.board];
      if (winCells || draw) {
        const dur = (Date.now() - startTimeRef.current) / 1000;
        recordGame('connect4', !!winCells && p === 1, newScore[0], dur, { winner: p, score: newScore[0], won: !!winCells && p === 1 });
      }
      if (player === undefined && p === 1) {
        recordPlayerAction(`col:${col}`, {
          aggression: 0.58,
          exploration: Math.abs(3 - col) / 3,
          risk: col === 0 || col === 6 ? 0.64 : 0.38,
          precision: 0.72,
        });
      }
      return { ...prev, board: nb, turn: p === 1 ? 2 : 1, winner: winCells ? p : null, winCells: winCells || null, draw, score: newScore, history: newHistory, aiThinking: !winCells && !draw && mode === '1p' && p === 1 };
    });
  }, [mode, recordGame, recordPlayerAction]);

  const undo = useCallback(() => {
    setGs(prev => {
      if (!prev.history.length || prev.aiThinking) return prev;
      const prevBoard = prev.history[prev.history.length - 1];
      // Undo 2 moves if in 1P mode (undo AI move too)
      const undoCount = mode === '1p' && prev.history.length >= 2 ? 2 : 1;
      const newHistory = prev.history.slice(0, -undoCount);
      const restoredBoard = newHistory.length ? newHistory[newHistory.length - 1] : makeBoard();
      return { ...prev, board: restoredBoard, history: newHistory, winner: null, winCells: null, draw: false, turn: 1, aiThinking: false };
    });
  }, [mode]);

  // AI move effect
  useEffect(() => {
    if (!gs.aiThinking || gs.winner || gs.draw) return;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    const depth = DIFF_DEPTH[difficulty];
    aiTimerRef.current = setTimeout(() => {
      const col = getBestMove(gs.board, depth, 2);
      setGs(prev => ({ ...prev, aiThinking: false }));
      doMove(col, 2);
    }, getAdaptiveDelay(300));
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [gs.aiThinking, gs.board, gs.winner, gs.draw, difficulty, doMove]);

  // AI Demo Mode (both players AI)
  useEffect(() => {
    if (!aiDemoMode || mode !== '1p' || gs.winner || gs.draw || gs.aiThinking || gs.aiDisabled) return;
    if (gs.turn !== 1) return; // AI handles p2 via aiThinking
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      const col = isAdaptive
        ? getAdaptiveMove(gs.board, 3, 1, getActionWeight)
        : getBestMove(gs.board, 3, 1);
      doMove(col, 1);
    }, getAdaptiveDelay(600));
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [aiDemoMode, doMove, getActionWeight, getAdaptiveDelay, gs.aiDisabled, gs.aiThinking, gs.board, gs.draw, gs.turn, gs.winner, isAdaptive, mode]);

  useEffect(() => {
    if (aiDemoMode) setGs(g => ({ ...g, aiDisabled: false }));
  }, [aiDemoMode]);

  useEffect(() => {
    const stopAI = () => { if (aiDemoRef.current) setGs(g => ({ ...g, aiDisabled: true })); };
    window.addEventListener('keydown', stopAI, true);
    return () => window.removeEventListener('keydown', stopAI, true);
  }, []);

  const best = bestScore('connect4');

  const CELL = 56;
  const winCellSet = new Set(gs.winCells?.map(([r, c]) => `${r},${c}`) ?? []);

  if (!configured) {
    return (
      <GameWrapper title="Connect 4">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
          <div style={{ color: '#fff', fontSize: 18 }}>Mode</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {(['1p', '2p'] as GameMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ padding: '8px 20px', fontSize: 14, background: mode === m ? '#e74c3c' : '#333', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                {m === '1p' ? '1 Player' : '2 Players'}
              </button>
            ))}
          </div>
          {mode === '1p' && <>
            <div style={{ color: '#fff', fontSize: 18 }}>Difficulty</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
                <button key={d} onClick={() => setDifficulty(d)}
                  style={{ padding: '8px 20px', fontSize: 14, background: difficulty === d ? '#f39c12' : '#333', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', textTransform: 'capitalize' }}>
                  {d}
                </button>
              ))}
            </div>
          </>}
          <button onClick={() => { setConfigured(true); setGs(initGs()); startTimeRef.current = Date.now(); }}
            style={{ padding: '12px 32px', fontSize: 16, background: '#27ae60', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 8 }}>
            Play
          </button>
          {best > 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Best Score: {best}</div>}
        </div>
      </GameWrapper>
    );
  }

  const p1Color = '#e74c3c';
  const p2Color = '#f1c40f';

  return (
    <GameWrapper title="Connect 4" score={gs.score[0]} onRestart={() => { setGs(initGs()); startTimeRef.current = Date.now(); }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 8 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 4, alignItems: 'center' }}>
          <div style={{ background: '#1a1a2e', padding: '4px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#e74c3c' }}>RED</div>
            <div style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>{gs.score[0]}</div>
          </div>
          <div style={{ color: '#aaa', fontSize: 12 }}>{mode === '1p' ? `vs AI (${difficulty})` : '2P'}</div>
          <div style={{ background: '#1a1a2e', padding: '4px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#f1c40f' }}>{mode === '1p' ? 'AI' : 'YELLOW'}</div>
            <div style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>{gs.score[1]}</div>
          </div>
          <button onClick={undo} disabled={!gs.history.length || gs.aiThinking}
            style={{ padding: '4px 10px', background: '#555', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Undo</button>
        </div>

        {/* Turn indicator */}
        {!gs.winner && !gs.draw && (
          <div style={{ color: gs.turn === 1 ? p1Color : p2Color, fontSize: 13, fontWeight: 'bold', height: 18 }}>
            {gs.aiThinking ? 'AI thinking...' : `${gs.turn === 1 ? (mode === '1p' ? 'Your' : "Red's") : (mode === '1p' ? "AI's" : "Yellow's")} turn`}
          </div>
        )}

        {/* Column drop buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: COLS }, (_, c) => (
            <button key={c}
              onClick={() => !gs.winner && !gs.draw && !gs.aiThinking && gs.turn === 1 && doMove(c)}
              disabled={!!gs.winner || gs.draw || gs.aiThinking || gs.turn !== 1 || gs.board[0][c] !== 0}
              style={{ width: CELL, height: 24, background: 'transparent', border: 'none', cursor: 'pointer', color: p1Color, fontSize: 16 }}>
              ▼
            </button>
          ))}
        </div>

        {/* Board */}
        <div style={{ background: '#1565c0', borderRadius: 8, padding: 4, display: 'inline-block' }}>
          {gs.board.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 4, marginBottom: r < ROWS - 1 ? 4 : 0 }}>
              {row.map((cell, c) => {
                const isWin = winCellSet.has(`${r},${c}`);
                return (
                  <div key={c}
                    onClick={() => !gs.winner && !gs.draw && !gs.aiThinking && gs.turn === 1 && doMove(c)}
                    style={{
                      width: CELL, height: CELL,
                      borderRadius: '50%',
                      background: cell === 0 ? '#0d47a1' : cell === 1 ? p1Color : p2Color,
                      cursor: !gs.winner && !gs.draw && !gs.aiThinking && gs.turn === 1 && gs.board[0][c] === 0 ? 'pointer' : 'default',
                      boxShadow: isWin ? '0 0 12px 4px white' : 'inset 0 2px 6px rgba(0,0,0,0.4)',
                      transition: 'background 0.15s',
                      border: isWin ? '2px solid white' : '2px solid transparent',
                    }} />
                );
              })}
            </div>
          ))}
        </div>

        <button onClick={() => setConfigured(false)}
          style={{ marginTop: 4, padding: '4px 12px', background: '#333', color: '#aaa', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
          Settings
        </button>

        {(gs.winner || gs.draw) && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: gs.winner === 1 ? p1Color : gs.winner === 2 ? p2Color : '#aaa' }}>
              {gs.draw ? "It's a Draw!" : gs.winner === 1 ? (mode === '1p' ? 'You Win!' : 'Red Wins!') : (mode === '1p' ? 'AI Wins!' : 'Yellow Wins!')}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button onClick={() => { setGs(initGs()); startTimeRef.current = Date.now(); }}
                style={{ padding: '10px 20px', fontSize: 16, background: '#27ae60', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Play Again</button>
              <button onClick={() => setConfigured(false)}
                style={{ padding: '10px 20px', fontSize: 16, background: '#555', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Menu</button>
            </div>
          </div>
        )}
      </div>
    </GameWrapper>
  );
}
