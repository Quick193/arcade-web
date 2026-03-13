import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { useApp } from '../store/AppContext';
import { useSwipe } from '../hooks/useSwipe';
import { useAIDemo } from '../hooks/useAIDemo';

type Grid = (number | 0)[][];

const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  0: { bg: '#cdc1b4', fg: '#776e65' },
  2: { bg: '#eee4da', fg: '#776e65' },
  4: { bg: '#ede0c8', fg: '#776e65' },
  8: { bg: '#f2b179', fg: '#f9f6f2' },
  16: { bg: '#f59563', fg: '#f9f6f2' },
  32: { bg: '#f67c5f', fg: '#f9f6f2' },
  64: { bg: '#f65e3b', fg: '#f9f6f2' },
  128: { bg: '#edcf72', fg: '#f9f6f2' },
  256: { bg: '#edcc61', fg: '#f9f6f2' },
  512: { bg: '#edc850', fg: '#f9f6f2' },
  1024: { bg: '#edc53f', fg: '#f9f6f2' },
  2048: { bg: '#edc22e', fg: '#f9f6f2' },
};

function makeGrid(): Grid {
  return Array.from({ length: 4 }, () => Array(4).fill(0));
}

function addRandom(grid: Grid): Grid {
  const g = grid.map(r => [...r]);
  const empties: [number, number][] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!g[r][c]) empties.push([r, c]);
  if (!empties.length) return g;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  g[r][c] = Math.random() < 0.9 ? 2 : 4;
  return g;
}

function slide(row: number[]): { row: number[]; score: number; moved: boolean } {
  const filtered = row.filter(x => x !== 0);
  let score = 0;
  for (let i = 0; i < filtered.length - 1; i++) {
    if (filtered[i] === filtered[i + 1]) {
      filtered[i] *= 2;
      score += filtered[i];
      filtered.splice(i + 1, 1);
    }
  }
  const newRow = [...filtered, ...Array(4 - filtered.length).fill(0)];
  const moved = newRow.some((v, i) => v !== row[i]);
  return { row: newRow, score, moved };
}

function moveGrid(grid: Grid, dir: 'up' | 'down' | 'left' | 'right'): { grid: Grid; score: number; moved: boolean } {
  let g = grid.map(r => [...r]);
  let totalScore = 0, anyMoved = false;

  if (dir === 'left') {
    for (let r = 0; r < 4; r++) {
      const { row, score, moved } = slide(g[r]);
      g[r] = row; totalScore += score; if (moved) anyMoved = true;
    }
  } else if (dir === 'right') {
    for (let r = 0; r < 4; r++) {
      const { row, score, moved } = slide([...g[r]].reverse());
      g[r] = row.reverse(); totalScore += score; if (moved) anyMoved = true;
    }
  } else if (dir === 'up') {
    for (let c = 0; c < 4; c++) {
      const col = [g[0][c], g[1][c], g[2][c], g[3][c]];
      const { row, score, moved } = slide(col);
      for (let r = 0; r < 4; r++) g[r][c] = row[r];
      totalScore += score; if (moved) anyMoved = true;
    }
  } else {
    for (let c = 0; c < 4; c++) {
      const col = [g[3][c], g[2][c], g[1][c], g[0][c]];
      const { row, score, moved } = slide(col);
      for (let r = 0; r < 4; r++) g[3 - r][c] = row[r];
      totalScore += score; if (moved) anyMoved = true;
    }
  }
  return { grid: g, score: totalScore, moved: anyMoved };
}

function hasMovesLeft(grid: Grid): boolean {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (!grid[r][c]) return true;
    if (c < 3 && grid[r][c] === grid[r][c + 1]) return true;
    if (r < 3 && grid[r][c] === grid[r + 1][c]) return true;
  }
  return false;
}

// Expectimax AI
function expectimax(grid: Grid, depth: number, isMax: boolean): number {
  if (depth === 0) return heuristic(grid);
  if (isMax) {
    let best = -Infinity;
    for (const dir of ['up','down','left','right'] as const) {
      const { grid: ng, moved } = moveGrid(grid, dir);
      if (!moved) continue;
      best = Math.max(best, expectimax(ng, depth - 1, false));
    }
    return best === -Infinity ? heuristic(grid) : best;
  } else {
    const empties: [number, number][] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!grid[r][c]) empties.push([r, c]);
    if (!empties.length) return heuristic(grid);
    let total = 0;
    for (const [r, c] of empties) {
      for (const [val, prob] of [[2, 0.9], [4, 0.1]] as const) {
        const ng = grid.map(row => [...row]);
        ng[r][c] = val;
        total += prob * expectimax(ng, depth - 1, true);
      }
    }
    return total / empties.length;
  }
}

function heuristic(grid: Grid): number {
  let empty = 0, smooth = 0, mono = 0, maxCorner = 0;
  const flat = grid.flat();
  const maxTile = Math.max(...flat);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (!grid[r][c]) empty++;
    if (c < 3 && grid[r][c] && grid[r][c + 1]) smooth -= Math.abs(Math.log2(grid[r][c]) - Math.log2(grid[r][c + 1]));
    if (r < 3 && grid[r][c] && grid[r + 1][c]) smooth -= Math.abs(Math.log2(grid[r][c]) - Math.log2(grid[r + 1][c]));
  }
  // Monotonicity
  for (let r = 0; r < 4; r++) {
    let inc = 0, dec = 0;
    for (let c = 0; c < 3; c++) {
      if (grid[r][c] >= grid[r][c + 1]) dec += (grid[r][c] ? Math.log2(grid[r][c]) : 0) - (grid[r][c+1] ? Math.log2(grid[r][c+1]) : 0);
      if (grid[r][c] <= grid[r][c + 1]) inc += (grid[r][c+1] ? Math.log2(grid[r][c+1]) : 0) - (grid[r][c] ? Math.log2(grid[r][c]) : 0);
    }
    mono += Math.max(inc, dec);
  }
  if (grid[3][3] === maxTile || grid[3][0] === maxTile || grid[0][3] === maxTile || grid[0][0] === maxTile) maxCorner = maxTile;
  return empty * 270 + smooth * 0.1 + mono * 1.0 + maxCorner * 0.5;
}

function getBestDir(grid: Grid): 'up' | 'down' | 'left' | 'right' | null {
  let best = -Infinity;
  let bestDir: 'up' | 'down' | 'left' | 'right' | null = null;
  for (const dir of ['up','down','left','right'] as const) {
    const { grid: ng, moved } = moveGrid(grid, dir);
    if (!moved) continue;
    const score = expectimax(ng, 4, false);
    if (score > best) { best = score; bestDir = dir; }
  }
  return bestDir;
}

function getAdaptiveDir(
  grid: Grid,
  getActionWeight: (action: string) => number
): 'up' | 'down' | 'left' | 'right' | null {
  const ranked = (['up', 'down', 'left', 'right'] as const)
    .map((dir) => {
      const { grid: nextGrid, moved } = moveGrid(grid, dir);
      if (!moved) return null;
      return {
        dir,
        score: expectimax(nextGrid, 4, false),
        weight: getActionWeight(`move:${dir}`),
      };
    })
    .filter((entry): entry is { dir: 'up' | 'down' | 'left' | 'right'; score: number; weight: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;
  const scoreFloor = ranked[0].score - 180;

  return ranked.reduce((best, entry) => {
    if (entry.score < scoreFloor) return best;
    const rank = entry.score + entry.weight * 90;
    return rank > best.rank ? { dir: entry.dir, rank } : best;
  }, { dir: ranked[0].dir, rank: ranked[0].score + ranked[0].weight * 90 }).dir;
}

interface GS {
  grid: Grid;
  score: number;
  won: boolean;
  continueGame: boolean;
  gameOver: boolean;
  history: Array<{ grid: Grid; score: number }>;
  mergeAnim: Set<string>;
  aiDisabled: boolean;
}

export function Game2048() {
  const { recordGame, checkAchievements, bestScore } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, getAdaptiveDelay, getActionWeight, recordPlayerAction } = useAIDemo('game2048');
  const aiDemoRef = useRef(aiDemoMode);
  aiDemoRef.current = aiDemoMode;
  const startTimeRef = useRef(Date.now());
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initGame = useCallback((): GS => {
    startTimeRef.current = Date.now();
    const g = addRandom(addRandom(makeGrid()));
    return { grid: g, score: 0, won: false, continueGame: false, gameOver: false, history: [], mergeAnim: new Set(), aiDisabled: false };
  }, []);

  const [gs, setGs] = useState<GS>(initGame);

  const doMove = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    setGs(prev => {
      if (prev.gameOver || (prev.won && !prev.continueGame)) return prev;
      const { grid: newGrid, score: addScore, moved } = moveGrid(prev.grid, dir);
      if (!moved) return prev;
      const withTile = addRandom(newGrid);
      const newScore = prev.score + addScore;
      const maxTile = Math.max(...withTile.flat());
      const won = !prev.won && maxTile >= 2048;
      const gameOver = !hasMovesLeft(withTile);
      const newHistory = [...prev.history.slice(-4), { grid: prev.grid, score: prev.score }];
      if (gameOver) {
        const dur = (Date.now() - startTimeRef.current) / 1000;
        recordGame('game2048', false, newScore, dur);
        checkAchievements('game2048', { score: newScore, maxTile });
      }
      return { ...prev, grid: withTile, score: newScore, won, gameOver, history: newHistory, mergeAnim: new Set() };
    });
  }, [recordGame, checkAchievements]);

  const undo = useCallback(() => {
    setGs(prev => {
      if (!prev.history.length) return prev;
      const last = prev.history[prev.history.length - 1];
      return { ...prev, grid: last.grid, score: last.score, history: prev.history.slice(0, -1), gameOver: false };
    });
  }, []);

  // AI
  useEffect(() => {
    if (!aiDemoMode || gs.gameOver || (gs.won && !gs.continueGame) || gs.aiDisabled) return;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      const dir = isAdaptive ? getAdaptiveDir(gs.grid, getActionWeight) : getBestDir(gs.grid);
      if (dir) doMove(dir);
    }, getAdaptiveDelay(200));
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [aiDemoMode, gs.grid, gs.gameOver, gs.won, gs.continueGame, gs.aiDisabled, doMove, getActionWeight, getAdaptiveDelay, isAdaptive]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, 'up'|'down'|'left'|'right'> = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right' };
      if (map[e.key]) {
        e.preventDefault();
        recordPlayerAction(`move:${map[e.key]}`, {
          aggression: map[e.key] === 'up' ? 0.62 : 0.45,
          exploration: map[e.key] === 'left' || map[e.key] === 'right' ? 0.66 : 0.4,
          risk: map[e.key] === 'down' ? 0.58 : 0.36,
        });
        doMove(map[e.key]);
      }
      if (e.key === 'z' || e.key === 'Z') undo();
    };
    window.addEventListener('keydown', onKey);
    const stopAI = () => { if (aiDemoRef.current) setGs(g => ({ ...g, aiDisabled: true })); };
    window.addEventListener('keydown', stopAI, true);
    window.addEventListener('touchstart', stopAI, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', stopAI, true);
      window.removeEventListener('touchstart', stopAI, true);
    };
  }, [doMove, undo]);

  useEffect(() => {
    if (aiDemoMode) setGs(g => ({ ...g, aiDisabled: false }));
  }, [aiDemoMode]);

  // Responsive tile size: fill viewport width with some padding, clamp 60–90px
  const [tileSize, setTileSize] = useState(() => {
    const avail = Math.min(window.innerWidth - 40, 380);
    return Math.max(60, Math.min(90, Math.floor((avail - 40) / 4)));
  });
  useEffect(() => {
    const onResize = () => {
      const avail = Math.min(window.innerWidth - 40, 380);
      setTileSize(Math.max(60, Math.min(90, Math.floor((avail - 40) / 4))));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { onTouchStart, onTouchEnd } = useSwipe({
    onSwipe: (dir) => {
      recordPlayerAction(`move:${dir}`, {
        aggression: dir === 'up' ? 0.62 : 0.45,
        exploration: dir === 'left' || dir === 'right' ? 0.68 : 0.4,
        risk: dir === 'down' ? 0.58 : 0.36,
      });
      doMove(dir);
    }
  });
  const best = bestScore('game2048');
  const maxTile = Math.max(...gs.grid.flat());

  return (
    <GameWrapper title="2048" score={gs.score} onRestart={() => setGs(initGame())}>
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 8 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
          <div style={{ background: '#bbada0', padding: '4px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#eee4da', fontWeight: 'bold' }}>SCORE</div>
            <div style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>{gs.score}</div>
          </div>
          <div style={{ background: '#bbada0', padding: '4px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#eee4da', fontWeight: 'bold' }}>BEST</div>
            <div style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>{Math.max(gs.score, best)}</div>
          </div>
          <button onClick={undo} disabled={!gs.history.length}
            style={{ padding: '4px 12px', background: '#8f7a66', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Undo</button>
        </div>
        <div style={{ background: '#bbada0', padding: 8, borderRadius: 8, display: 'grid', gridTemplateColumns: `repeat(4, ${tileSize}px)`, gap: 8 }}>
          {gs.grid.map((row, r) => row.map((val, c) => {
            const colors = TILE_COLORS[val] || { bg: '#3c3a32', fg: '#f9f6f2' };
            const fontSize = val >= 1024 ? Math.round(tileSize * 0.25) : val >= 128 ? Math.round(tileSize * 0.3) : Math.round(tileSize * 0.4);
            return (
              <div key={`${r}${c}`} style={{ width: tileSize, height: tileSize, background: colors.bg, color: colors.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize, fontWeight: 'bold', fontFamily: 'sans-serif', transition: 'background 0.12s' }}>
                {val !== 0 ? val : ''}
              </div>
            );
          }))}
        </div>
        {gs.won && !gs.continueGame && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(237,197,63,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
            <div style={{ fontSize: 36, fontWeight: 'bold', color: '#fff' }}>You Win!</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button onClick={() => setGs(g => ({ ...g, continueGame: true }))} style={{ padding: '10px 20px', fontSize: 16, background: '#8f7a66', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Continue</button>
              <button onClick={() => setGs(initGame())} style={{ padding: '10px 20px', fontSize: 16, background: '#bbada0', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>New Game</button>
            </div>
          </div>
        )}
        {gs.gameOver && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(119,110,101,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
            <div style={{ fontSize: 36, fontWeight: 'bold', color: '#fff' }}>Game Over!</div>
            <div style={{ color: '#eee', marginBottom: 12 }}>Max tile: {maxTile}</div>
            <button onClick={() => setGs(initGame())} style={{ padding: '10px 24px', fontSize: 16, background: '#8f7a66', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>New Game</button>
          </div>
        )}
      </div>
    </GameWrapper>
  );
}
