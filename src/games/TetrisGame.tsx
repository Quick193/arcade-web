import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { GameOverlay } from '../components/GameOverlay';
import { MobileControlBar } from '../components/MobileControlBar';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';
import { GamePausedContext } from '../contexts/GamePausedContext';

const COLS = 10;
const ROWS = 20;

function calcLayout(winW: number) {
  // On small screens shrink cell size and sidebar to fit
  const maxBoardW = Math.min(winW - 8, 500); // max 500px, leave 4px margin each side
  // sidebar*2 + COLS*cell = total width
  // keep sidebar = 2.5 * cell roughly; but clamp sidebar min to 60
  const cellFull = Math.floor(maxBoardW / (COLS + 5)); // COLS + 2*(sidebar/cell ratio ~2.5)
  const CELL = Math.max(14, Math.min(28, cellFull));
  const SIDEBAR = Math.max(60, Math.floor(CELL * 2.8));
  const CANVAS_W = COLS * CELL + SIDEBAR * 2;
  const CANVAS_H = ROWS * CELL + 60;
  return { CELL, SIDEBAR, CANVAS_W, CANVAS_H };
}

const COLORS: Record<string, string> = {
  I: '#26c6da', O: '#ffee58', T: '#ab47bc',
  S: '#66bb6a', Z: '#ef5350', J: '#5c86ff', L: '#ffa726',
};

const PIECES: Record<string, number[][][]> = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  ],
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]],
  ],
  S: [
    [[0,1,1],[1,1,0],[0,0,0]],
    [[0,1,0],[0,1,1],[0,0,1]],
    [[0,0,0],[0,1,1],[1,1,0]],
    [[1,0,0],[1,1,0],[0,1,0]],
  ],
  Z: [
    [[1,1,0],[0,1,1],[0,0,0]],
    [[0,0,1],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,0,0]],
  ],
  J: [
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,1,1],[0,1,0],[0,1,0]],
    [[0,0,0],[1,1,1],[0,0,1]],
    [[0,1,0],[0,1,0],[1,1,0]],
  ],
  L: [
    [[0,0,1],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,0],[0,1,1]],
    [[0,0,0],[1,1,1],[1,0,0]],
    [[1,1,0],[0,1,0],[0,1,0]],
  ],
};

const KICK_JLSTZ: Record<string, [number,number][]> = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const KICK_I: Record<string, [number,number][]> = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};

type Grid = (string | null)[][];
type Mode = 'menu' | 'marathon' | 'sprint' | 'ultra';

interface Piece {
  type: string;
  x: number;
  y: number;
  rot: number;
}

function makeGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeBag(): string[] {
  return shuffle(['I','O','T','S','Z','J','L']);
}

function getMatrix(p: Piece): number[][] {
  return PIECES[p.type][p.rot];
}

function fits(grid: Grid, piece: Piece, dx = 0, dy = 0, rot?: number): boolean {
  const r = rot !== undefined ? rot : piece.rot;
  const mat = PIECES[piece.type][r];
  for (let row = 0; row < mat.length; row++) {
    for (let col = 0; col < mat[row].length; col++) {
      if (!mat[row][col]) continue;
      const nx = piece.x + col + dx;
      const ny = piece.y + row + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && grid[ny][nx]) return false;
    }
  }
  return true;
}

function ghostY(grid: Grid, piece: Piece): number {
  let dy = 0;
  while (fits(grid, piece, 0, dy + 1)) dy++;
  return piece.y + dy;
}

function placePiece(grid: Grid, piece: Piece): Grid {
  const g = grid.map(r => [...r]);
  const mat = getMatrix(piece);
  for (let row = 0; row < mat.length; row++) {
    for (let col = 0; col < mat[row].length; col++) {
      if (!mat[row][col]) continue;
      const nx = piece.x + col;
      const ny = piece.y + row;
      if (ny >= 0 && ny < ROWS) g[ny][nx] = piece.type;
    }
  }
  return g;
}

function clearLines(grid: Grid): { grid: Grid; lines: number } {
  const newGrid = grid.filter(row => row.some(c => !c));
  const lines = ROWS - newGrid.length;
  while (newGrid.length < ROWS) newGrid.unshift(Array(COLS).fill(null));
  return { grid: newGrid, lines };
}

function isTSpin(grid: Grid, piece: Piece, rotated: boolean): boolean {
  if (piece.type !== 'T' || !rotated) return false;
  const corners = [[0,0],[2,0],[0,2],[2,2]];
  let blocked = 0;
  for (const [dc, dr] of corners) {
    const nx = piece.x + dc;
    const ny = piece.y + dr;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || grid[ny]?.[nx]) blocked++;
  }
  return blocked >= 3;
}

function evalBoard(grid: Grid): number {
  let height = 0, holes = 0, bumpiness = 0;
  const colHeights = Array(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (grid[r][c]) { colHeights[c] = ROWS - r; break; }
    }
    height += colHeights[c];
    let found = false;
    for (let r = 0; r < ROWS; r++) {
      if (grid[r][c]) found = true;
      else if (found) holes++;
    }
  }
  for (let c = 0; c < COLS - 1; c++) bumpiness += Math.abs(colHeights[c] - colHeights[c+1]);
  const clears = grid.filter(row => row.every(c => c)).length;
  return -0.51 * height + 0.76 * clears - 0.36 * holes - 0.18 * bumpiness;
}

function aiBestMove(grid: Grid, piece: Piece): { rot: number; col: number } {
  let bestScore = -Infinity;
  let bestRot = 0, bestCol = piece.x;
  const numRots = PIECES[piece.type].length;
  for (let rot = 0; rot < numRots; rot++) {
    for (let col = -2; col < COLS + 2; col++) {
      const tryPiece: Piece = { ...piece, rot, x: col };
      if (!fits(grid, tryPiece)) continue;
      let dy = 0;
      while (fits(grid, tryPiece, 0, dy + 1)) dy++;
      const placed = placePiece(grid, { ...tryPiece, y: tryPiece.y + dy });
      const score = evalBoard(placed);
      if (score > bestScore) { bestScore = score; bestRot = rot; bestCol = col; }
    }
  }
  return { rot: bestRot, col: bestCol };
}

function adaptiveTetrisMove(
  grid: Grid,
  piece: Piece,
  getActionWeight: (action: string) => number
): { rot: number; col: number } {
  let bestEngine = -Infinity;
  const candidates: Array<{ rot: number; col: number; engine: number; style: number }> = [];
  const numRots = PIECES[piece.type].length;

  for (let rot = 0; rot < numRots; rot++) {
    for (let col = -2; col < COLS + 2; col++) {
      const tryPiece: Piece = { ...piece, rot, x: col };
      if (!fits(grid, tryPiece)) continue;
      let dy = 0;
      while (fits(grid, tryPiece, 0, dy + 1)) dy++;
      const placed = placePiece(grid, { ...tryPiece, y: tryPiece.y + dy });
      const engine = evalBoard(placed);
      bestEngine = Math.max(bestEngine, engine);
      const style = (getActionWeight(`rot:${rot}`) - 1) * 0.22 + (getActionWeight(`col:${Math.max(0, Math.min(COLS - 1, col))}`) - 1) * 0.18;
      candidates.push({ rot, col, engine, style });
    }
  }

  const shortlist = candidates.filter((candidate) => bestEngine - candidate.engine <= 0.35);
  shortlist.sort((a, b) => (b.engine + b.style) - (a.engine + a.style));
  const picked = shortlist[0] ?? candidates.sort((a, b) => b.engine - a.engine)[0];
  return { rot: picked.rot, col: picked.col };
}

interface GameState {
  grid: Grid;
  piece: Piece;
  queue: string[];
  held: string | null;
  holdUsed: boolean;
  score: number;
  lines: number;
  level: number;
  combo: number;
  b2b: boolean;
  gravityTimer: number;
  lockTimer: number;
  lockResets: number;
  lockActive: boolean;
  softDrop: boolean;
  paused: boolean;
  gameOver: boolean;
  lastTime: number;
  mode: Mode;
  timeLeft: number | null;
  linesLeft: number | null;
  lastRotated: boolean;
  aiTarget: { rot: number; col: number } | null;
  aiActed: boolean;
  aiDelay: number;
  startTime: number;
}

export function TetrisGame() {
  const { recordGame, checkAchievements, bestScore, navigate } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, mode: demoMode, cycleMode, getActionWeight, recordPlayerAction } = useAIDemo('tetris');
  const isHubPaused = useContext(GamePausedContext);
  const isHubPausedRef = useRef(false);
  isHubPausedRef.current = isHubPaused;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const [mode, setMode] = useState<Mode>('menu');
  const [displayScore, setDisplayScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<'playing' | 'gameover'>('playing');
  const gamePhaseRef = useRef<'playing' | 'gameover'>('playing');
  const best = bestScore('tetris');
  const aiDemoRef = useRef(aiDemoMode);
  aiDemoRef.current = aiDemoMode;
  const aiOnRef = useRef(aiDemoMode);
  aiOnRef.current = aiDemoMode;
  const demoLabel = demoMode === 'adaptive' ? '🧠 Learn Me' : aiDemoMode ? '🤖 Classic AI' : '🎮 Demo Off';

  // Responsive layout
  const [winW, setWinW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const layout = calcLayout(winW);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const spawnNext = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;
    if (gs.queue.length < 6) gs.queue.push(...makeBag());
    const type = gs.queue.shift()!;
    gs.piece = { type, x: 3, y: 0, rot: 0 };
    gs.holdUsed = false;
    gs.lockActive = false;
    gs.lockTimer = 0;
    gs.lockResets = 0;
    gs.lastRotated = false;
    gs.aiTarget = null;
    gs.aiActed = false;
    gs.aiDelay = 300;
    if (!fits(gs.grid, gs.piece)) {
      gs.gameOver = true;
      const dur = (Date.now() - gs.startTime) / 1000;
      recordGame('tetris', false, gs.score, dur);
      checkAchievements('tetris', { score: gs.score });
    }
  }, [recordGame, checkAchievements]);

  const tryMoveFn = useCallback((dx: number, dy: number): boolean => {
    const gs = gsRef.current;
    if (!gs || !fits(gs.grid, gs.piece, dx, dy)) return false;
    gs.piece.x += dx;
    gs.piece.y += dy;
    if (gs.lockActive) { gs.lockTimer = 0; if (gs.lockResets < 15) gs.lockResets++; }
    return true;
  }, []);

  const tryRotateFn = useCallback((dir: 1 | -1) => {
    const gs = gsRef.current;
    if (!gs) return;
    const from = gs.piece.rot;
    const to = (from + 4 + dir) & 3;
    const key = `${from}>${to}`;
    const kicks = gs.piece.type === 'I' ? KICK_I[key] : KICK_JLSTZ[key];
    for (const [kx, ky] of (kicks || [[0,0]])) {
      if (fits(gs.grid, gs.piece, kx, -ky, to)) {
        gs.piece.rot = to;
        gs.piece.x += kx;
        gs.piece.y -= ky;
        gs.lastRotated = true;
        if (gs.lockActive) { gs.lockTimer = 0; if (gs.lockResets < 15) gs.lockResets++; }
        return;
      }
    }
  }, []);

  const lockPieceFn = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;
    const tspin = isTSpin(gs.grid, gs.piece, gs.lastRotated);
    gs.grid = placePiece(gs.grid, gs.piece);
    const { grid, lines } = clearLines(gs.grid);
    gs.grid = grid;
    gs.lines += lines;
    if (gs.linesLeft !== null) gs.linesLeft = Math.max(0, gs.linesLeft - lines);
    const linePts = [0, 100, 300, 500, 800];
    let pts = linePts[Math.min(lines, 4)] * gs.level;
    if (tspin && lines > 0) pts = [0, 400, 700, 1200][Math.min(lines, 3)] * gs.level;
    const difficult = lines === 4 || (tspin && lines > 0);
    if (difficult && gs.b2b) pts = Math.floor(pts * 1.5);
    gs.b2b = difficult;
    if (lines > 0) { gs.combo++; pts += 50 * gs.combo * gs.level; } else gs.combo = -1;
    gs.score += pts;
    const newLevel = Math.floor(gs.lines / 10) + 1;
    if (newLevel > gs.level) gs.level = newLevel;
    if (gs.linesLeft !== null && gs.linesLeft <= 0) {
      gs.gameOver = true;
      const dur = (Date.now() - gs.startTime) / 1000;
      recordGame('tetris', true, gs.score, dur);
      checkAchievements('tetris', { score: gs.score, won: true });
      return;
    }
    spawnNext();
  }, [spawnNext, recordGame, checkAchievements]);

  const hardDropFn = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;
    const gy = ghostY(gs.grid, gs.piece);
    gs.score += (gy - gs.piece.y) * 2;
    gs.piece.y = gy;
    lockPieceFn();
  }, [lockPieceFn]);

  const holdPieceFn = useCallback(() => {
    const gs = gsRef.current;
    if (!gs || gs.holdUsed) return;
    const cur = gs.piece.type;
    if (gs.held) {
      gs.piece = { type: gs.held, x: 3, y: 0, rot: 0 };
    } else {
      spawnNext();
    }
    gs.held = cur;
    gs.holdUsed = true;
    gs.aiTarget = null;
    gs.aiActed = false;
  }, [spawnNext]);

  const toggleTetrisAI = useCallback(() => {
    cycleMode();
  }, [cycleMode]);

  const startGame = useCallback((m: Mode) => {
    setMode(m);
    setGamePhase('playing');
    gamePhaseRef.current = 'playing';
    const q = [...makeBag(), ...makeBag()];
    const type = q.shift()!;
    const piece: Piece = { type, x: 3, y: 0, rot: 0 };
    gsRef.current = {
      grid: makeGrid(), piece, queue: q, held: null, holdUsed: false,
      score: 0, lines: 0, level: 1, combo: -1, b2b: false,
      gravityTimer: 0, lockTimer: 0, lockResets: 0, lockActive: false,
      softDrop: false, paused: false, gameOver: false,
      lastTime: performance.now(), mode: m,
      timeLeft: m === 'ultra' ? 180000 : null,
      linesLeft: m === 'sprint' ? 40 : null,
      lastRotated: false, aiTarget: null, aiActed: false, aiDelay: 600,
      startTime: Date.now(),
    };
  }, []);

  useEffect(() => {
    if (mode === 'menu') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    function drawMiniPiece(type: string, ox: number, oy: number) {
      const mat = PIECES[type][0];
      const cs = Math.max(10, Math.round(layoutRef.current.CELL * 0.65));
      ctx.fillStyle = COLORS[type];
      for (let r = 0; r < mat.length; r++) {
        for (let c = 0; c < mat[r].length; c++) {
          if (!mat[r][c]) continue;
          ctx.fillRect(ox + c * cs + 1, oy + r * cs + 1, cs - 2, cs - 2);
        }
      }
    }

    function render() {
      const gs = gsRef.current;
      if (!gs) return;
      const { CELL, SIDEBAR, CANVAS_W, CANVAS_H } = layoutRef.current;
      if (canvas && (canvas.width !== CANVAS_W || canvas.height !== CANVAS_H)) {
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
      }
      const miniCs = Math.max(10, Math.round(CELL * 0.65));
      const sFontSm = Math.max(8, Math.round(CELL * 0.40));
      const sFontMd = Math.max(10, Math.round(CELL * 0.52));
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(SIDEBAR, 30, COLS * CELL, ROWS * CELL);
      ctx.strokeStyle = '#2a2a4a';
      ctx.lineWidth = 0.5;
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(SIDEBAR, 30 + r * CELL); ctx.lineTo(SIDEBAR + COLS * CELL, 30 + r * CELL); ctx.stroke();
      }
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath(); ctx.moveTo(SIDEBAR + c * CELL, 30); ctx.lineTo(SIDEBAR + c * CELL, 30 + ROWS * CELL); ctx.stroke();
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (gs.grid[r][c]) {
            ctx.fillStyle = COLORS[gs.grid[r][c]!];
            ctx.fillRect(SIDEBAR + c * CELL + 1, 30 + r * CELL + 1, CELL - 2, CELL - 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.strokeRect(SIDEBAR + c * CELL + 1, 30 + r * CELL + 1, CELL - 2, CELL - 2);
          }
        }
      }
      if (!gs.gameOver) {
        const gy = ghostY(gs.grid, gs.piece);
        const mat = getMatrix(gs.piece);
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = COLORS[gs.piece.type];
        for (let r = 0; r < mat.length; r++) {
          for (let c = 0; c < mat[r].length; c++) {
            if (!mat[r][c]) continue;
            ctx.fillRect(SIDEBAR + (gs.piece.x + c) * CELL + 1, 30 + (gy + r) * CELL + 1, CELL - 2, CELL - 2);
          }
        }
        ctx.globalAlpha = 1;
        const pmat = getMatrix(gs.piece);
        ctx.fillStyle = COLORS[gs.piece.type];
        for (let r = 0; r < pmat.length; r++) {
          for (let c = 0; c < pmat[r].length; c++) {
            if (!pmat[r][c]) continue;
            ctx.fillRect(SIDEBAR + (gs.piece.x + c) * CELL + 1, 30 + (gs.piece.y + r) * CELL + 1, CELL - 2, CELL - 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.strokeRect(SIDEBAR + (gs.piece.x + c) * CELL + 1, 30 + (gs.piece.y + r) * CELL + 1, CELL - 2, CELL - 2);
          }
        }
      }
      // Left sidebar
      const lx = SIDEBAR / 2;
      ctx.fillStyle = '#333360';
      ctx.fillRect(0, 30, SIDEBAR - 5, ROWS * CELL);
      ctx.fillStyle = '#aaa'; ctx.font = `bold ${sFontMd}px monospace`; ctx.textAlign = 'center';
      ctx.fillText('HOLD', lx, 30 + miniCs);
      if (gs.held) drawMiniPiece(gs.held, lx - miniCs * 1.5, 30 + miniCs * 1.8);
      const statY = 30 + miniCs * 7;
      const statStep = miniCs * 2.8;
      ctx.fillStyle = '#aaa'; ctx.font = `${sFontSm}px monospace`;
      ctx.fillText('SCORE', lx, statY);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${sFontMd}px monospace`;
      ctx.fillText(gs.score.toString(), lx, statY + miniCs);
      ctx.fillStyle = '#aaa'; ctx.font = `${sFontSm}px monospace`;
      ctx.fillText('LEVEL', lx, statY + statStep);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${sFontMd}px monospace`;
      ctx.fillText(gs.level.toString(), lx, statY + statStep + miniCs);
      ctx.fillStyle = '#aaa'; ctx.font = `${sFontSm}px monospace`;
      ctx.fillText('LINES', lx, statY + statStep * 2);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${sFontMd}px monospace`;
      ctx.fillText(gs.lines.toString(), lx, statY + statStep * 2 + miniCs);
      if (gs.mode === 'sprint' && gs.linesLeft !== null) {
        ctx.fillStyle = '#aaa'; ctx.font = `${sFontSm}px monospace`; ctx.fillText('LEFT', lx, statY + statStep * 3);
        ctx.fillStyle = '#ff9'; ctx.font = `bold ${sFontMd}px monospace`; ctx.fillText(gs.linesLeft.toString(), lx, statY + statStep * 3 + miniCs);
      }
      if (gs.mode === 'ultra' && gs.timeLeft !== null) {
        const secs = Math.ceil(gs.timeLeft / 1000);
        ctx.fillStyle = '#aaa'; ctx.font = `${sFontSm}px monospace`; ctx.fillText('TIME', lx, statY + statStep * 3);
        ctx.fillStyle = '#ff9'; ctx.font = `bold ${sFontMd}px monospace`;
        ctx.fillText(`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`, lx, statY + statStep * 3 + miniCs);
      }
      // Right sidebar
      const rx = SIDEBAR + COLS * CELL + 5;
      const rw = SIDEBAR - 5;
      const rcx = rx + rw / 2;
      ctx.fillStyle = '#333360';
      ctx.fillRect(rx, 30, rw, ROWS * CELL);
      ctx.fillStyle = '#aaa'; ctx.font = `bold ${sFontMd}px monospace`; ctx.textAlign = 'center';
      ctx.fillText('NEXT', rcx, 30 + miniCs);
      for (let i = 0; i < Math.min(4, gs.queue.length); i++) {
        drawMiniPiece(gs.queue[i], rcx - miniCs * 1.5, 30 + miniCs * 2 + i * miniCs * 4.5);
      }
      if (gs.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(SIDEBAR, 30, COLS * CELL, ROWS * CELL);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(16, CELL)}px monospace`; ctx.textAlign = 'center';
        ctx.fillText('PAUSED', SIDEBAR + COLS * CELL / 2, 30 + ROWS * CELL / 2);
      }
      if (gs.gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(SIDEBAR, 30, COLS * CELL, ROWS * CELL);
        ctx.fillStyle = '#ff5'; ctx.font = `bold ${Math.max(14, CELL - 4)}px monospace`; ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', SIDEBAR + COLS * CELL / 2, 30 + ROWS * CELL / 2 - 20);
        ctx.fillStyle = '#fff'; ctx.font = `${sFontMd}px monospace`;
        ctx.fillText(`Score: ${gs.score}`, SIDEBAR + COLS * CELL / 2, 30 + ROWS * CELL / 2 + 10);
        ctx.fillStyle = '#4fc3f7'; ctx.font = `${sFontSm}px monospace`;
        ctx.fillText('Tap button below', SIDEBAR + COLS * CELL / 2, 30 + ROWS * CELL / 2 + 35);
      }
      // AI badge
      if (aiOnRef.current) {
        ctx.fillStyle = 'rgba(0,200,255,0.85)';
        ctx.beginPath();
        ctx.roundRect(SIDEBAR + COLS * CELL / 2 - 28, 5, 56, 20, 5);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = `bold ${sFontSm}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('🤖 AI ON', SIDEBAR + COLS * CELL / 2, 19);
        ctx.textAlign = 'left';
      }
    }

    function gameLoop(timestamp: number) {
      const gs = gsRef.current;
      if (!gs) return;
      const dt = Math.min(timestamp - gs.lastTime, 100);
      gs.lastTime = timestamp;
      if (!gs.paused && !gs.gameOver && !isHubPausedRef.current) {
        if (gs.mode === 'ultra' && gs.timeLeft !== null) {
          gs.timeLeft -= dt;
          if (gs.timeLeft <= 0) {
            gs.gameOver = true;
            const dur = (Date.now() - gs.startTime) / 1000;
            recordGame('tetris', false, gs.score, dur);
            checkAchievements('tetris', { score: gs.score });
          }
        }
        if (aiOnRef.current) {
          if (gs.aiDelay > 0) { gs.aiDelay -= dt; }
          else {
            if (!gs.aiTarget) { gs.aiTarget = isAdaptive ? adaptiveTetrisMove(gs.grid, gs.piece, getActionWeight) : aiBestMove(gs.grid, gs.piece); gs.aiActed = false; }
            const { rot, col } = gs.aiTarget;
            if (gs.piece.rot !== rot) { tryRotateFn(1); gs.aiDelay = 60; }
            else if (gs.piece.x < col) { tryMoveFn(1, 0); gs.aiDelay = 60; }
            else if (gs.piece.x > col) { tryMoveFn(-1, 0); gs.aiDelay = 60; }
            else if (!gs.aiActed) { gs.aiActed = true; hardDropFn(); gs.aiDelay = 300; }
          }
        } else {
          const gravityMs = Math.max(100, 1000 - (gs.level - 1) * 80);
          const effectiveGravity = gs.softDrop ? gravityMs / 10 : gravityMs;
          gs.gravityTimer += dt;
          if (gs.gravityTimer >= effectiveGravity) {
            gs.gravityTimer = 0;
            if (gs.softDrop) gs.score++;
            if (!tryMoveFn(0, 1)) {
              if (!gs.lockActive) { gs.lockActive = true; gs.lockTimer = 0; }
            }
          }
          if (gs.lockActive) {
            gs.lockTimer += dt;
            if (gs.lockTimer >= 500 || gs.lockResets >= 15) {
              gs.lockActive = false;
              if (!fits(gs.grid, gs.piece, 0, 1)) lockPieceFn();
            }
          }
          if (!gs.lockActive && !fits(gs.grid, gs.piece, 0, 1)) {
            gs.lockActive = true; gs.lockTimer = 0;
          }
        }
      }
      setDisplayScore(gs.score);
      if (gs.gameOver && gamePhaseRef.current === 'playing') {
        gamePhaseRef.current = 'gameover';
        setGamePhase('gameover');
      }
      render();
      rafRef.current = requestAnimationFrame(gameLoop);
    }

    rafRef.current = requestAnimationFrame(gameLoop);

    const onKey = (e: KeyboardEvent) => {
      const gs = gsRef.current;
      if (!gs) return;
      if (e.key === 'Escape') { setMode('menu'); return; }
      if (e.key === 'p' || e.key === 'P') { gs.paused = !gs.paused; return; }
      if (gs.paused || gs.gameOver) return;
      switch (e.key) {
        case 'ArrowLeft': recordPlayerAction(`col:${Math.max(0, gs.piece.x - 1)}`, { exploration: 0.66 }); tryMoveFn(-1, 0); break;
        case 'ArrowRight': recordPlayerAction(`col:${Math.min(COLS - 1, gs.piece.x + 1)}`, { exploration: 0.66 }); tryMoveFn(1, 0); break;
        case 'ArrowDown': gs.softDrop = true; break;
        case 'ArrowUp': case 'x': case 'X': recordPlayerAction(`rot:${(gs.piece.rot + 1) & 3}`, { precision: 0.68 }); tryRotateFn(1); break;
        case 'z': case 'Z': recordPlayerAction(`rot:${(gs.piece.rot + 3) & 3}`, { precision: 0.68 }); tryRotateFn(-1); break;
        case ' ': e.preventDefault(); recordPlayerAction('drop', { aggression: 0.62, tempo: 0.7 }); hardDropFn(); break;
        case 'c': case 'C': case 'Shift': recordPlayerAction('hold', { exploration: 0.6, risk: 0.42 }); holdPieceFn(); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { const gs = gsRef.current; if (gs) gs.softDrop = false; }
    };

    let touchSX = 0, touchSY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchSX = e.touches[0].clientX; touchSY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchSX;
      const dy = e.changedTouches[0].clientY - touchSY;
      const gs = gsRef.current;
      if (!gs) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 20) {
          recordPlayerAction(dx > 0 ? `col:${Math.min(COLS - 1, gs.piece.x + 1)}` : `col:${Math.max(0, gs.piece.x - 1)}`, { exploration: 0.66 });
          tryMoveFn(dx > 0 ? 1 : -1, 0);
        }
      } else {
        if (dy > 30) gs.softDrop = true;
        else if (dy < -30) { recordPlayerAction('drop', { aggression: 0.62, tempo: 0.7 }); hardDropFn(); }
        else { recordPlayerAction(`rot:${(gs.piece.rot + 1) & 3}`, { precision: 0.68 }); tryRotateFn(1); }
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (mode === 'menu') {
    return (
      <GameWrapper title="Tetris Pro" score={displayScore}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <h2 style={{ color: '#26c6da', fontSize: 28, fontFamily: 'monospace', margin: 0 }}>SELECT MODE</h2>
          {(['marathon','sprint','ultra'] as Mode[]).map(m => (
            <button key={m} onClick={() => startGame(m)}
              style={{ padding: '12px 40px', fontSize: 16, background: '#333360', color: '#fff', border: '2px solid #26c6da', borderRadius: 8, cursor: 'pointer' }}>
              {m === 'marathon' ? 'Marathon' : m === 'sprint' ? 'Sprint (40 Lines)' : 'Ultra (3 min)'}
            </button>
          ))}
        </div>
      </GameWrapper>
    );
  }

  return (
    <GameWrapper
      title="Tetris Pro"
      score={displayScore}
      onRestart={() => startGame(mode)}
      controls={(
        <MobileControlBar
          items={[
            { id: 'left',   label: '◀',      onPress: () => { const gs = gsRef.current; if (!gs || gs.gameOver || gs.paused) return; tryMoveFn(-1, 0); } },
            { id: 'rotate', label: '↻ SPIN',  onPress: () => { const gs = gsRef.current; if (!gs || gs.gameOver || gs.paused) return; tryRotateFn(1); }, tone: 'accent' },
            { id: 'right',  label: '▶',      onPress: () => { const gs = gsRef.current; if (!gs || gs.gameOver || gs.paused) return; tryMoveFn(1, 0); }, },
            { id: 'drop',   label: '⬇ DROP', onPress: () => { const gs = gsRef.current; if (!gs || gs.gameOver || gs.paused) return; hardDropFn(); }, tone: 'danger' },
          ]}
          hint="◀ ▶ move · ↻ rotate · ⬇ hard drop · swipe canvas to soft drop"
        />
      )}
    >
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <canvas ref={canvasRef} width={layout.CANVAS_W} height={layout.CANVAS_H} style={{ maxWidth: '100%', touchAction: 'none', display: 'block' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTetrisAI}
            style={{ padding: '5px 14px', fontSize: 12, background: demoMode === 'adaptive' ? '#7b1fa2' : aiDemoMode ? '#0288d1' : '#333', color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer' }}>
            {demoLabel}
          </button>
          <button onClick={() => { cancelAnimationFrame(rafRef.current); navigate('menu'); }}
            style={{ padding: '5px 14px', fontSize: 12, background: '#555', color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer' }}>
            Hub
          </button>
        </div>
        <GameOverlay
          visible={gamePhase === 'gameover'}
          eyebrow="Game Over"
          title="Stack Collapsed"
          score={displayScore}
          best={best}
          primaryLabel="Play Again"
          onPrimary={() => startGame(mode)}
          secondaryLabel="Back to Hub"
          onSecondary={() => { cancelAnimationFrame(rafRef.current); navigate('menu'); }}
        />
      </div>
    </GameWrapper>
  );
}
