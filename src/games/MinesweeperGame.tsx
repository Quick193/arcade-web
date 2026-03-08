import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';

type Difficulty = 'easy' | 'medium' | 'hard';
type CellState = 'hidden' | 'revealed' | 'flagged';

interface Cell { mine: boolean; adjacent: number; state: CellState; }

interface Config { rows: number; cols: number; mines: number; }

const CONFIGS: Record<Difficulty, Config> = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 12, cols: 12, mines: 25 },
  hard: { rows: 16, cols: 16, mines: 40 },
};

const NUM_COLORS = ['','#1565c0','#2e7d32','#c62828','#1a237e','#880e4f','#006064','#000','#555'];

interface GS {
  board: Cell[][];
  rows: number; cols: number; mines: number;
  gameState: 'idle' | 'playing' | 'won' | 'lost';
  firstClick: boolean;
  flagCount: number;
  time: number;
  timerActive: boolean;
  score: number;
  hints: number;
  difficulty: Difficulty;
  selectedCell: [number,number] | null;
  aiDisabled: boolean;
}

function makeBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ mine: false, adjacent: 0, state: 'hidden' as CellState })));
}

function placeMines(board: Cell[][], rows: number, cols: number, mines: number, safeR: number, safeC: number): Cell[][] {
  const b = board.map(r => r.map(c => ({ ...c })));
  const safe = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const nr = safeR + dr, nc = safeC + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) safe.add(`${nr},${nc}`);
  }
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows), c = Math.floor(Math.random() * cols);
    if (!safe.has(`${r},${c}`) && !b[r][c].mine) { b[r][c].mine = true; placed++; }
  }
  // Calculate adjacents
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (b[r][c].mine) continue;
    let cnt = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r+dr, nc = c+dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && b[nr][nc].mine) cnt++;
    }
    b[r][c].adjacent = cnt;
  }
  return b;
}

function floodReveal(board: Cell[][], rows: number, cols: number, r: number, c: number): Cell[][] {
  const b = board.map(row => row.map(cell => ({ ...cell })));
  const queue: [number, number][] = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.shift()!;
    if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue;
    const cell = b[cr][cc];
    if (cell.state !== 'hidden') continue;
    cell.state = 'revealed';
    if (cell.adjacent === 0) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        queue.push([cr + dr, cc + dc]);
      }
    }
  }
  return b;
}

// AI: constraint propagation solver
function aiSolve(gs: GS): { action: 'reveal' | 'flag'; r: number; c: number } | null {
  const { board, rows, cols } = gs;
  // Find certain moves
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cell = board[r][c];
    if (cell.state !== 'revealed' || cell.adjacent === 0) continue;
    const neighbors: [number,number][] = [];
    const flagged: [number,number][] = [];
    const hidden: [number,number][] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r+dr, nc = c+dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      neighbors.push([nr, nc]);
      if (board[nr][nc].state === 'flagged') flagged.push([nr, nc]);
      if (board[nr][nc].state === 'hidden') hidden.push([nr, nc]);
    }
    void neighbors;
    if (hidden.length === 0) continue;
    if (flagged.length === cell.adjacent) {
      return { action: 'reveal', r: hidden[0][0], c: hidden[0][1] };
    }
    if (flagged.length + hidden.length === cell.adjacent) {
      return { action: 'flag', r: hidden[0][0], c: hidden[0][1] };
    }
  }
  // Find lowest probability hidden cell near revealed
  let bestR = -1, bestC = -1, bestProb = Infinity;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (board[r][c].state !== 'hidden') continue;
    let mineCount = 0, constraintCount = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r+dr, nc = c+dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || (dr === 0 && dc === 0)) continue;
      const nb = board[nr][nc];
      if (nb.state === 'revealed' && nb.adjacent > 0) {
        const flaggedN = (() => {
          let f = 0;
          for (let dr2 = -1; dr2 <= 1; dr2++) for (let dc2 = -1; dc2 <= 1; dc2++) {
            const nr2 = nr+dr2, nc2 = nc+dc2;
            if (nr2 >= 0 && nr2 < rows && nc2 >= 0 && nc2 < cols && board[nr2][nc2].state === 'flagged') f++;
          }
          return f;
        })();
        const hiddenN = (() => {
          let h = 0;
          for (let dr2 = -1; dr2 <= 1; dr2++) for (let dc2 = -1; dc2 <= 1; dc2++) {
            const nr2 = nr+dr2, nc2 = nc+dc2;
            if (nr2 >= 0 && nr2 < rows && nc2 >= 0 && nc2 < cols && board[nr2][nc2].state === 'hidden') h++;
          }
          return h;
        })();
        if (hiddenN > 0) { mineCount += (nb.adjacent - flaggedN) / hiddenN; constraintCount++; }
      }
    }
    if (constraintCount > 0) {
      const prob = mineCount / constraintCount;
      if (prob < bestProb) { bestProb = prob; bestR = r; bestC = c; }
    }
  }
  if (bestR >= 0) return { action: 'reveal', r: bestR, c: bestC };
  // Random unrevealed
  const hidden: [number,number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (board[r][c].state === 'hidden') hidden.push([r, c]);
  }
  if (hidden.length > 0) {
    const [r, c] = hidden[Math.floor(Math.random() * hidden.length)];
    return { action: 'reveal', r, c };
  }
  return null;
}

export function MinesweeperGame() {
  const { recordGame, checkAchievements } = useApp();
  const { isEnabled: aiDemoMode, getAdaptiveDelay, recordPlayerAction } = useAIDemo('minesweeper');
  const aiDemoRef = useRef(aiDemoMode);
  aiDemoRef.current = aiDemoMode;
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initGame = useCallback((diff: Difficulty): GS => {
    const { rows, cols, mines } = CONFIGS[diff];
    return {
      board: makeBoard(rows, cols), rows, cols, mines,
      gameState: 'idle', firstClick: true, flagCount: 0,
      time: 0, timerActive: false, score: 0, hints: 3,
      difficulty: diff, selectedCell: null, aiDisabled: false,
    };
  }, []);

  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [gs, setGs] = useState<GS>(() => initGame('easy'));

  const reveal = useCallback((r: number, c: number) => {
    recordPlayerAction(`reveal:${r},${c}`, {
      precision: 0.76,
      exploration: 0.5,
      risk: 0.44,
    });
    setGs(prev => {
      if (prev.gameState === 'won' || prev.gameState === 'lost') return prev;
      const cell = prev.board[r][c];
      if (cell.state !== 'hidden') {
        // Chord
        if (cell.state === 'revealed' && cell.adjacent > 0) {
          let flagged = 0;
          const hidden: [number,number][] = [];
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const nr = r+dr, nc = c+dc;
            if (nr < 0 || nr >= prev.rows || nc < 0 || nc >= prev.cols || (dr === 0 && dc === 0)) continue;
            if (prev.board[nr][nc].state === 'flagged') flagged++;
            if (prev.board[nr][nc].state === 'hidden') hidden.push([nr, nc]);
          }
          if (flagged === cell.adjacent && hidden.length > 0) {
            let b = prev.board;
            let lost = false;
            for (const [hr, hc] of hidden) {
              if (b[hr][hc].mine) { lost = true; break; }
              b = floodReveal(b, prev.rows, prev.cols, hr, hc);
            }
            if (lost) {
              const b2 = prev.board.map(row => row.map(c2 => c2.mine ? { ...c2, state: 'revealed' as CellState } : { ...c2 }));
              const dur = (Date.now() - startTimeRef.current) / 1000;
              recordGame('minesweeper', false, prev.score, dur);
              checkAchievements('minesweeper', { score: prev.score });
              return { ...prev, board: b2, gameState: 'lost' };
            }
            const won = b.every(row => row.every(c2 => c2.mine || c2.state === 'revealed'));
            if (won) {
              const dur = (Date.now() - startTimeRef.current) / 1000;
              const sc = prev.board.flat().filter(c2 => !c2.mine).length * 10 + Math.max(0, 300 - prev.time * 2);
              recordGame('minesweeper', true, sc, dur);
              checkAchievements('minesweeper', { score: sc, won: true, difficulty: prev.difficulty });
              return { ...prev, board: b, gameState: 'won', score: sc };
            }
            return { ...prev, board: b };
          }
        }
        return prev;
      }
      let newBoard = prev.board;
      let state2: GS['gameState'] = prev.gameState;
      let firstClick = prev.firstClick;
      if (prev.firstClick) {
        newBoard = placeMines(prev.board, prev.rows, prev.cols, prev.mines, r, c);
        firstClick = false;
        startTimeRef.current = Date.now();
        state2 = 'playing';
      }
      if (newBoard[r][c].mine) {
        const b2 = newBoard.map(row => row.map(c2 => c2.mine ? { ...c2, state: 'revealed' as CellState } : { ...c2 }));
        const dur = (Date.now() - startTimeRef.current) / 1000;
        recordGame('minesweeper', false, prev.score, dur);
        checkAchievements('minesweeper', { score: prev.score });
        return { ...prev, board: b2, gameState: 'lost', firstClick };
      }
      const b3 = floodReveal(newBoard, prev.rows, prev.cols, r, c);
      const won = b3.every(row => row.every(c2 => c2.mine || c2.state === 'revealed'));
      if (won) {
        const dur = (Date.now() - startTimeRef.current) / 1000;
        const sc = b3.flat().filter(c2 => !c2.mine).length * 10 + Math.max(0, 300 - prev.time * 2);
        recordGame('minesweeper', true, sc, dur);
        checkAchievements('minesweeper', { score: sc, won: true, difficulty: prev.difficulty });
        return { ...prev, board: b3, gameState: 'won', firstClick, score: sc };
      }
      return { ...prev, board: b3, gameState: state2, firstClick };
    });
  }, [checkAchievements, recordGame, recordPlayerAction]);

  const flag = useCallback((r: number, c: number) => {
    recordPlayerAction(`flag:${r},${c}`, {
      precision: 0.84,
      aggression: 0.32,
      risk: 0.2,
    });
    setGs(prev => {
      if (prev.gameState === 'won' || prev.gameState === 'lost') return prev;
      const cell = prev.board[r][c];
      if (cell.state === 'revealed') return prev;
      const newBoard = prev.board.map(row => row.map(c2 => ({ ...c2 })));
      const newState: CellState = cell.state === 'hidden' ? 'flagged' : 'hidden';
      newBoard[r][c].state = newState;
      const df = newState === 'flagged' ? 1 : -1;
      return { ...prev, board: newBoard, flagCount: prev.flagCount + df };
    });
  }, [recordPlayerAction]);

  const hint = useCallback(() => {
    recordPlayerAction('hint', { precision: 0.3, risk: 0.15 });
    setGs(prev => {
      if (prev.hints <= 0 || prev.gameState === 'won' || prev.gameState === 'lost' || prev.firstClick) return prev;
      for (let r = 0; r < prev.rows; r++) for (let c = 0; c < prev.cols; c++) {
        if (prev.board[r][c].state === 'hidden' && !prev.board[r][c].mine) {
          const b = floodReveal(prev.board, prev.rows, prev.cols, r, c);
          return { ...prev, board: b, hints: prev.hints - 1 };
        }
      }
      return prev;
    });
  }, [recordPlayerAction]);

  // Timer
  useEffect(() => {
    if (gs.gameState === 'playing') {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setGs(g => g.gameState === 'playing' ? { ...g, time: g.time + 1 } : g), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gs.gameState]);

  // AI
  useEffect(() => {
    if (!aiDemoMode || gs.aiDisabled || gs.gameState === 'won' || gs.gameState === 'lost') return;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      if (gs.firstClick) { reveal(Math.floor(gs.rows / 2), Math.floor(gs.cols / 2)); return; }
      const action = aiSolve(gs);
      if (action) {
        if (action.action === 'reveal') reveal(action.r, action.c);
        else flag(action.r, action.c);
      }
    }, getAdaptiveDelay(350));
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [aiDemoMode, flag, getAdaptiveDelay, gs, reveal]);

  useEffect(() => {
    if (aiDemoMode) setGs(g => ({ ...g, aiDisabled: false }));
  }, [aiDemoMode]);

  // Stop AI on player input
  useEffect(() => {
    const stop = () => { if (aiDemoRef.current) setGs(g => ({ ...g, aiDisabled: true })); };
    window.addEventListener('keydown', stop, true);
    window.addEventListener('touchstart', stop, true);
    return () => { window.removeEventListener('keydown', stop, true); window.removeEventListener('touchstart', stop, true); };
  }, []);

  if (!difficulty) {
    return (
      <GameWrapper title="Minesweeper">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <h2 style={{ color: '#4fc3f7', fontFamily: 'monospace', margin: 0 }}>MINESWEEPER</h2>
          {(['easy','medium','hard'] as Difficulty[]).map(d => (
            <button key={d} onClick={() => { setDifficulty(d); setGs(initGame(d)); }}
              style={{ padding: '10px 32px', fontSize: 15, background: '#1a2a3a', color: '#fff', border: '2px solid #4fc3f7', borderRadius: 8, cursor: 'pointer', textTransform: 'capitalize' }}>
              {d} ({CONFIGS[d].rows}x{CONFIGS[d].cols} / {CONFIGS[d].mines} mines)
            </button>
          ))}
        </div>
      </GameWrapper>
    );
  }

  const cellSize = difficulty === 'hard' ? 22 : difficulty === 'medium' ? 26 : 32;

  const faceEmoji = gs.gameState === 'won' ? '😎' : gs.gameState === 'lost' ? '😵' : gs.firstClick ? '😊' : '😮';

  return (
    <GameWrapper title="Minesweeper" onRestart={() => { setGs(initGame(gs.difficulty)); }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 8 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontFamily: 'monospace', fontSize: 14 }}>
          <span style={{ color: '#f44', fontWeight: 'bold' }}>💣 {gs.mines - gs.flagCount}</span>
          <button onClick={() => setGs(initGame(gs.difficulty))} style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}>{faceEmoji}</button>
          <span style={{ color: '#4fc', fontWeight: 'bold' }}>⏱ {gs.time}s</span>
          <button onClick={hint} disabled={gs.hints <= 0 || gs.firstClick} style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>
            {'💡'.repeat(gs.hints)}
          </button>
        </div>
        <div style={{ overflow: 'auto', maxHeight: '70vh' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gs.cols}, ${cellSize}px)`, gap: 1, background: '#333' }}>
            {gs.board.map((row, r) => row.map((cell, c) => {
              let bg = '#bdbdbd', color2 = '#000', content = '';
              if (cell.state === 'revealed') {
                bg = cell.mine ? '#f44' : '#e0e0e0';
                if (cell.mine) content = '💣';
                else if (cell.adjacent > 0) { content = cell.adjacent.toString(); color2 = NUM_COLORS[cell.adjacent]; }
              } else if (cell.state === 'flagged') { content = '🚩'; bg = '#c9a227'; }
              else { bg = '#9e9e9e'; }
              return (
                <div key={`${r}${c}`}
                  style={{ width: cellSize, height: cellSize, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: cellSize * 0.55, fontWeight: 'bold', color: color2, cursor: 'pointer', userSelect: 'none', border: cell.state === 'hidden' ? '1px solid #757575' : 'none', boxSizing: 'border-box' }}
                  onClick={() => { if (!aiDemoRef.current || gs.aiDisabled) reveal(r, c); }}
                  onContextMenu={(e) => { e.preventDefault(); if (!aiDemoRef.current || gs.aiDisabled) flag(r, c); }}
                  onPointerDown={() => { longPressRef.current = setTimeout(() => flag(r, c), 600); }}
                  onPointerUp={() => { if (longPressRef.current) clearTimeout(longPressRef.current); }}
                >
                  {content}
                </div>
              );
            }))}
          </div>
        </div>
        {gs.gameState !== 'idle' && gs.gameState !== 'playing' && (
          <div style={{ color: gs.gameState === 'won' ? '#4fc' : '#f44', fontWeight: 'bold', fontFamily: 'monospace', fontSize: 16 }}>
            {gs.gameState === 'won' ? `You Win! Score: ${gs.score}` : 'BOOM! Game Over'}
          </div>
        )}
        <button onClick={() => setDifficulty(null)} style={{ padding: '4px 12px', background: '#333', color: '#aaa', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Change Difficulty</button>
      </div>
    </GameWrapper>
  );
}
