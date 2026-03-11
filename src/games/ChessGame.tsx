import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';

// ─── Types ────────────────────────────────────────────────────
type Color = 'w' | 'b';
type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type Square = { type: PieceType; color: Color } | null;
type Board = Square[][];
type Difficulty = 'easy' | 'medium' | 'hard';
type TimeControl = 'none' | '3+2' | '5+0' | '10+0' | '15+10';
type MoveClassification = 'brilliant' | 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

const BADGE_SYMBOLS: Record<MoveClassification, string> = {
  brilliant: '!!', great: '!', good: 'i', inaccuracy: '?!', mistake: '?', blunder: '??',
};
const BADGE_COLORS: Record<MoveClassification, string> = {
  brilliant: '#00e5ff', great: '#4caf50', good: '#81c784', inaccuracy: '#ff9800', mistake: '#ff9800', blunder: '#f44336',
};

function classifyMove(delta: number): MoveClassification {
  // delta = actual eval - best eval (≤ 0 means worse than best)
  if (delta >= -0.1) return 'great';
  if (delta >= -0.3) return 'good';
  if (delta >= -0.8) return 'inaccuracy';
  if (delta >= -2.0) return 'mistake';
  return 'blunder';
}

// ─── Save/Load types ──────────────────────────────────────────
interface SavedGame {
  id: string;
  savedAt: string;
  label: string;
  setupMode: 'pvp' | 'ai';
  setupDifficulty: Difficulty;
  setupPlayerColor: Color;
  setupTimeControl: TimeControl;
  moveCount: number;
  gameResult: string | null;
  boardJson: string; // JSON of board
  historyJson: string; // JSON of history array
  evalScore: number;
  fullStateJson: string;
  isAnalysis?: boolean;
  analysisJson?: string;
}
const SAVES_KEY = 'chess_saves';
const MAX_SAVES = 20;

function loadSavedGames(): SavedGame[] {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedGame[];
  } catch { return []; }
}

function persistSaves(saves: SavedGame[]) {
  try { localStorage.setItem(SAVES_KEY, JSON.stringify(saves)); } catch { /* storage full */ }
}

function deleteSaveFromStorage(saves: SavedGame[], id: string): SavedGame[] {
  const next = saves.filter(s => s.id !== id);
  persistSaves(next);
  return next;
}

// ─── Analysis types ───────────────────────────────────────────
interface AnalysisEntry {
  board: Board;
  turn: Color;
  cr: CastlingRights;
  ep: [number, number] | null;
  history: string[];
  capturedW: PieceType[];
  capturedB: PieceType[];
  lastMove: [[number, number], [number, number]] | null;
  evalScore: number | null;
  bestMove: [number, number, number, number] | null;
  classification: MoveClassification | null;
  moveIdx: number; // index of the move that led to this position
}

interface AnalysisState {
  entries: AnalysisEntry[];
  currentIdx: number;
  isComputing: boolean;
  depth: 2 | 3 | 4;
}

// ─── Arrow drawing ────────────────────────────────────────────
function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromR: number, fromC: number,
  toR: number, toC: number,
  flip: boolean, SQ: number,
  color = 'rgba(0,120,255,0.75)'
) {
  const toCanvasCenter = (r: number, c: number) => {
    const sc = flip ? 7 - c : c;
    const sr = flip ? 7 - r : r;
    return [sc * SQ + SQ / 2, sr * SQ + SQ / 2] as [number, number];
  };
  const [x1, y1] = toCanvasCenter(fromR, fromC);
  const [x2, y2] = toCanvasCenter(toR, toC);
  const isKnightArrow = (Math.abs(fromR - toR) === 2 && Math.abs(fromC - toC) === 1)
    || (Math.abs(fromR - toR) === 1 && Math.abs(fromC - toC) === 2);

  const points: [number, number][] = isKnightArrow
    ? (Math.abs(fromR - toR) > Math.abs(fromC - toC)
      ? [[x1, y1], [x1, y2], [x2, y2]]
      : [[x1, y1], [x2, y1], [x2, y2]])
    : [[x1, y1], [x2, y2]];

  const [sx, sy] = points[points.length - 2];
  const dx = x2 - sx;
  const dy = y2 - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const ux = dx / len;
  const uy = dy / len;
  const headLen = SQ * 0.34;
  const headW = SQ * 0.2;
  const shaftW = SQ * 0.14;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = shaftW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = SQ * 0.08;

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x1, y1, shaftW * 0.65, 0, Math.PI * 2);
  ctx.fill();

  const baseX = x2 - ux * headLen;
  const baseY = y2 - uy * headLen;
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(baseX + px * headW, baseY + py * headW);
  ctx.lineTo(baseX - px * headW, baseY - py * headW);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── Piece Square Tables (from Python) ────────────────────────
const PIECE_VALUES: Record<PieceType, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

const PST: Record<PieceType, number[]> = {
  P: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  N: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  B: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  R: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  Q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  K: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

function pstVal(type: PieceType, r: number, c: number, color: Color): number {
  const idx = color === 'w' ? (7 - r) * 8 + c : r * 8 + c;
  return PST[type][idx] ?? 0;
}

// ─── Board setup ──────────────────────────────────────────────
function makeBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let c = 0; c < 8; c++) {
    b[0][c] = { type: back[c], color: 'b' };
    b[1][c] = { type: 'P', color: 'b' };
    b[6][c] = { type: 'P', color: 'w' };
    b[7][c] = { type: back[c], color: 'w' };
  }
  return b;
}

function copyBoard(b: Board): Board { return b.map(r => r.map(s => s ? { ...s } : null)); }

// ─── Move generation ──────────────────────────────────────────
interface CastlingRights { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean }

function isAttacked(board: Board, row: number, col: number, byColor: Color): boolean {
  const opp = byColor;
  // Rook/Queen
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (let i = 1; i < 8; i++) {
      const nr = row + dr * i, nc = col + dc * i;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
      const sq = board[nr][nc];
      if (sq) { if (sq.color === opp && (sq.type === 'R' || sq.type === 'Q')) return true; break; }
    }
  }
  // Bishop/Queen
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    for (let i = 1; i < 8; i++) {
      const nr = row + dr * i, nc = col + dc * i;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
      const sq = board[nr][nc];
      if (sq) { if (sq.color === opp && (sq.type === 'B' || sq.type === 'Q')) return true; break; }
    }
  }
  // Knight
  for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
    const nr = row + dr, nc = col + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc]?.color === opp && board[nr][nc]?.type === 'N') return true;
  }
  // Pawn
  const pd = opp === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const nr = row + pd, nc = col + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc]?.color === opp && board[nr][nc]?.type === 'P') return true;
  }
  // King
  for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    const nr = row + dr, nc = col + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc]?.color === opp && board[nr][nc]?.type === 'K') return true;
  }
  return false;
}

function isInCheck(board: Board, color: Color): boolean {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (board[r][c]?.type === 'K' && board[r][c]?.color === color) return isAttacked(board, r, c, color === 'w' ? 'b' : 'w');
  }
  return true;
}

function getPseudoMoves(board: Board, r: number, c: number, ep: [number, number] | null, cr: CastlingRights): [number, number][] {
  const sq = board[r][c];
  if (!sq) return [];
  const { type, color } = sq;
  const opp = color === 'w' ? 'b' : 'w';
  const moves: [number, number][] = [];
  const add = (nr: number, nc: number) => { if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc]?.color !== color) moves.push([nr, nc]); };
  const slide = (dirs: [number, number][]) => {
    for (const [dr, dc] of dirs) for (let i = 1; i < 8; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
      add(nr, nc); if (board[nr][nc]) break;
    }
  };
  if (type === 'P') {
    const dir = color === 'w' ? -1 : 1;
    if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
      moves.push([r + dir, c]);
      const sr = color === 'w' ? 6 : 1;
      if (r === sr && !board[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        if (board[nr][nc]?.color === opp) moves.push([nr, nc]);
        if (ep && ep[0] === nr && ep[1] === nc) moves.push([nr, nc]);
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) add(r + dr, c + dc);
  } else if (type === 'B') { slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]); }
  else if (type === 'R') { slide([[-1, 0], [1, 0], [0, -1], [0, 1]]); }
  else if (type === 'Q') { slide([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]); }
  else if (type === 'K') {
    for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) add(r + dr, c + dc);
    if (color === 'w' && r === 7 && c === 4) {
      if (cr.wK && !board[7][5] && !board[7][6] && !isAttacked(board, 7, 4, 'b') && !isAttacked(board, 7, 5, 'b') && !isAttacked(board, 7, 6, 'b')) moves.push([7, 6]);
      if (cr.wQ && !board[7][3] && !board[7][2] && !board[7][1] && !isAttacked(board, 7, 4, 'b') && !isAttacked(board, 7, 3, 'b') && !isAttacked(board, 7, 2, 'b')) moves.push([7, 2]);
    }
    if (color === 'b' && r === 0 && c === 4) {
      if (cr.bK && !board[0][5] && !board[0][6] && !isAttacked(board, 0, 4, 'w') && !isAttacked(board, 0, 5, 'w') && !isAttacked(board, 0, 6, 'w')) moves.push([0, 6]);
      if (cr.bQ && !board[0][3] && !board[0][2] && !board[0][1] && !isAttacked(board, 0, 4, 'w') && !isAttacked(board, 0, 3, 'w') && !isAttacked(board, 0, 2, 'w')) moves.push([0, 2]);
    }
  }
  return moves;
}

function getLegalMoves(board: Board, r: number, c: number, ep: [number, number] | null, cr: CastlingRights): [number, number][] {
  const color = board[r][c]?.color;
  if (!color) return [];
  return getPseudoMoves(board, r, c, ep, cr).filter(([nr, nc]) => {
    const nb = copyBoard(board);
    applyMove(nb, r, c, nr, nc, ep, cr, null);
    return !isInCheck(nb, color);
  });
}

function getAllLegalMoves(board: Board, color: Color, ep: [number, number] | null, cr: CastlingRights): [number, number, number, number][] {
  const moves: [number, number, number, number][] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (board[r][c]?.color !== color) continue;
    for (const [nr, nc] of getLegalMoves(board, r, c, ep, cr)) moves.push([r, c, nr, nc]);
  }
  return moves;
}

function applyMove(board: Board, r: number, c: number, nr: number, nc: number, ep: [number, number] | null, cr: CastlingRights, promote: PieceType | null) {
  const sq = board[r][c]!;
  board[nr][nc] = promote ? { type: promote, color: sq.color } : { ...sq };
  board[r][c] = null;
  if (sq.type === 'P' && ep && nr === ep[0] && nc === ep[1]) board[r][nc] = null; // en passant
  if (sq.type === 'K') {
    if (r === 7 && c === 4 && nr === 7 && nc === 6) { board[7][5] = { type: 'R', color: 'w' }; board[7][7] = null; }
    if (r === 7 && c === 4 && nr === 7 && nc === 2) { board[7][3] = { type: 'R', color: 'w' }; board[7][0] = null; }
    if (r === 0 && c === 4 && nr === 0 && nc === 6) { board[0][5] = { type: 'R', color: 'b' }; board[0][7] = null; }
    if (r === 0 && c === 4 && nr === 0 && nc === 2) { board[0][3] = { type: 'R', color: 'b' }; board[0][0] = null; }
  }
}

// ─── SAN notation ─────────────────────────────────────────────
function toSAN(board: Board, r: number, c: number, nr: number, nc: number, promote: PieceType | null, isCheck: boolean, isMate: boolean): string {
  const sq = board[r][c]!;
  const files = 'abcdefgh';
  const ranks = '87654321';
  const end = files[nc] + ranks[nr];
  const isCapture = !!board[nr][nc] || (sq.type === 'P' && c !== nc);
  if (sq.type === 'K' && Math.abs(c - nc) === 2) return nc > c ? 'O-O' : 'O-O-O';
  let s: string;
  if (sq.type === 'P') {
    s = isCapture ? files[c] + 'x' + end : end;
    if (promote) s += '=' + promote;
  } else {
    s = sq.type + (isCapture ? 'x' : '') + end;
  }
  if (isMate) s += '#';
  else if (isCheck) s += '+';
  return s;
}

// ─── Static eval ──────────────────────────────────────────────
function countMaterial(board: Board): { w: number; b: number } {
  let w = 0, b = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const sq = board[r][c];
    if (!sq || sq.type === 'K') continue;
    if (sq.color === 'w') w += PIECE_VALUES[sq.type]; else b += PIECE_VALUES[sq.type];
  }
  return { w, b };
}

const PST_KING_ENDGAME: number[] = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

function evaluate(board: Board): number {
  let score = 0;
  const mat = countMaterial(board);
  const isEndgame = (mat.w + mat.b) < 2600; // roughly when queens are off or few pieces

  // Mobility (simplified)
  let wMobility = 0, bMobility = 0;

  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const sq = board[r][c];
    if (!sq) continue;
    let pstScore: number;
    if (sq.type === 'K' && isEndgame) {
      const idx = sq.color === 'w' ? (7 - r) * 8 + c : r * 8 + c;
      pstScore = PST_KING_ENDGAME[idx];
    } else {
      pstScore = pstVal(sq.type, r, c, sq.color);
    }
    const v = PIECE_VALUES[sq.type] + pstScore;
    score += sq.color === 'w' ? v : -v;

    // Bishop pair bonus
    // Pawn structure: doubled pawns penalty
    if (sq.type === 'P') {
      // Check for doubled pawn
      for (let rr = r + (sq.color === 'w' ? -1 : 1); rr >= 0 && rr < 8; rr += (sq.color === 'w' ? -1 : 1)) {
        if (board[rr][c]?.type === 'P' && board[rr][c]?.color === sq.color) {
          score += sq.color === 'w' ? -15 : 15;
          break;
        }
      }
      // Passed pawn bonus
      let passed = true;
      const dir = sq.color === 'w' ? -1 : 1;
      for (let rr = r + dir; rr >= 0 && rr < 8; rr += dir) {
        for (const dc of [-1, 0, 1]) {
          const nc = c + dc;
          if (nc >= 0 && nc < 8 && board[rr][nc]?.type === 'P' && board[rr][nc]?.color !== sq.color) {
            passed = false; break;
          }
        }
        if (!passed) break;
      }
      if (passed) {
        const advancement = sq.color === 'w' ? 7 - r : r;
        score += (sq.color === 'w' ? 1 : -1) * (advancement * 10);
      }
    }

    // Simple mobility: count moves for non-pawn pieces
    if (sq.type !== 'P' && sq.type !== 'K') {
      // Count available squares (simplified — just sliding piece reach)
      const dirs: [number, number][] = sq.type === 'N' ? [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
        : sq.type === 'B' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
          : sq.type === 'R' ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
            : [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]; // Queen
      let mob = 0;
      if (sq.type === 'N') {
        for (const [dr, dc] of dirs) {
          const nr2 = r + dr, nc2 = c + dc;
          if (nr2 >= 0 && nr2 < 8 && nc2 >= 0 && nc2 < 8 && board[nr2][nc2]?.color !== sq.color) mob++;
        }
      } else {
        for (const [dr, dc] of dirs) {
          for (let i = 1; i < 8; i++) {
            const nr2 = r + dr * i, nc2 = c + dc * i;
            if (nr2 < 0 || nr2 > 7 || nc2 < 0 || nc2 > 7) break;
            if (board[nr2][nc2]) { if (board[nr2][nc2]!.color !== sq.color) mob++; break; }
            mob++;
          }
        }
      }
      if (sq.color === 'w') wMobility += mob; else bMobility += mob;
    }
  }

  // Mobility bonus (3 centipawns per square)
  score += (wMobility - bMobility) * 3;

  return score / 100;
}

// ─── Minimax AI with quiescence ───────────────────────────────
function quiescence(board: Board, alpha: number, beta: number, color: Color, ep: [number, number] | null, cr: CastlingRights, qdepth: number): number {
  const standPat = evaluate(board);
  if (qdepth <= 0) return standPat;
  if (color === 'w') {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    const moves = getAllLegalMoves(board, color, ep, cr).filter(([, , nr, nc]) => !!board[nr][nc]);
    moves.sort((a, b) => (board[b[2]][b[3]] ? PIECE_VALUES[board[b[2]][b[3]]!.type] : 0) - (board[a[2]][a[3]] ? PIECE_VALUES[board[a[2]][a[3]]!.type] : 0));
    for (const [r, c, nr, nc] of moves) {
      const nb = copyBoard(board); applyMove(nb, r, c, nr, nc, ep, cr, null);
      const val = quiescence(nb, alpha, beta, 'b', null, cr, qdepth - 1);
      if (val > alpha) alpha = val;
      if (alpha >= beta) return beta;
    }
    return alpha;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
    const moves = getAllLegalMoves(board, color, ep, cr).filter(([, , nr, nc]) => !!board[nr][nc]);
    moves.sort((a, b) => (board[b[2]][b[3]] ? PIECE_VALUES[board[b[2]][b[3]]!.type] : 0) - (board[a[2]][a[3]] ? PIECE_VALUES[board[a[2]][a[3]]!.type] : 0));
    for (const [r, c, nr, nc] of moves) {
      const nb = copyBoard(board); applyMove(nb, r, c, nr, nc, ep, cr, null);
      const val = quiescence(nb, alpha, beta, 'w', null, cr, qdepth - 1);
      if (val < beta) beta = val;
      if (alpha >= beta) return alpha;
    }
    return beta;
  }
}

function minimax(board: Board, depth: number, alpha: number, beta: number, color: Color, ep: [number, number] | null, cr: CastlingRights): number {
  const moves = getAllLegalMoves(board, color, ep, cr);
  if (moves.length === 0) return isInCheck(board, color) ? (color === 'w' ? -(10000 + depth) : (10000 + depth)) : 0;
  if (depth <= 0) return quiescence(board, alpha, beta, color, ep, cr, 4);

  // Move ordering: captures (MVV-LVA), then checks, then rest
  moves.sort((a, b) => {
    const capA = board[a[2]][a[3]] ? PIECE_VALUES[board[a[2]][a[3]]!.type] - PIECE_VALUES[board[a[0]][a[1]]!.type] / 100 : 0;
    const capB = board[b[2]][b[3]] ? PIECE_VALUES[board[b[2]][b[3]]!.type] - PIECE_VALUES[board[b[0]][b[1]]!.type] / 100 : 0;
    // Bonus for promotions
    const promoA = board[a[0]][a[1]]?.type === 'P' && (a[2] === 0 || a[2] === 7) ? 800 : 0;
    const promoB = board[b[0]][b[1]]?.type === 'P' && (b[2] === 0 || b[2] === 7) ? 800 : 0;
    return (capB + promoB) - (capA + promoA);
  });

  if (color === 'w') {
    let best = -Infinity;
    for (const [r, c, nr, nc] of moves) {
      const nb = copyBoard(board); applyMove(nb, r, c, nr, nc, ep, cr, null);
      best = Math.max(best, minimax(nb, depth - 1, alpha, beta, 'b', null, cr));
      alpha = Math.max(alpha, best); if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const [r, c, nr, nc] of moves) {
      const nb = copyBoard(board); applyMove(nb, r, c, nr, nc, ep, cr, null);
      best = Math.min(best, minimax(nb, depth - 1, alpha, beta, 'w', null, cr));
      beta = Math.min(beta, best); if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestMove(board: Board, color: Color, ep: [number, number] | null, cr: CastlingRights, diff: Difficulty): [number, number, number, number] | null {
  const depths: Record<Difficulty, number> = { easy: 2, medium: 3, hard: 5 };
  const randChance: Record<Difficulty, number> = { easy: 0.35, medium: 0.04, hard: 0 };
  const depth = depths[diff];
  const moves = getAllLegalMoves(board, color, ep, cr);
  if (!moves.length) return null;
  if (Math.random() < randChance[diff]) return moves[Math.floor(Math.random() * moves.length)];
  // Shuffle for variety among equal moves
  for (let i = moves.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[moves[i], moves[j]] = [moves[j], moves[i]]; }
  // MVV-LVA sort
  moves.sort((a, b) => {
    const capA = board[a[2]][a[3]] ? PIECE_VALUES[board[a[2]][a[3]]!.type] : 0;
    const capB = board[b[2]][b[3]] ? PIECE_VALUES[board[b[2]][b[3]]!.type] : 0;
    return capB - capA;
  });
  let best: [number, number, number, number] | null = null;
  let bestVal = color === 'w' ? -Infinity : Infinity;
  for (const [r, c, nr, nc] of moves) {
    const nb = copyBoard(board); applyMove(nb, r, c, nr, nc, ep, cr, null);
    const val = minimax(nb, depth - 1, -Infinity, Infinity, color === 'w' ? 'b' : 'w', null, cr);
    if (color === 'w' ? val > bestVal : val < bestVal) { bestVal = val; best = [r, c, nr, nc]; }
  }
  return best;
}

function normalizeStyleSquare(r: number, c: number, color: Color): string {
  const nr = color === 'w' ? r : 7 - r;
  const nc = color === 'w' ? c : 7 - c;
  return `${'abcdefgh'[nc]}${8 - nr}`;
}

function getChessStyleActions(board: Board, r: number, c: number, nr: number, nc: number, moveCount: number): string[] {
  const piece = board[r][c];
  if (!piece) return [];

  const fromSq = normalizeStyleSquare(r, c, piece.color);
  const toSq = normalizeStyleSquare(nr, nc, piece.color);
  const actions = [`piece:${piece.type}`, `from:${fromSq}`, `to:${toSq}`];

  if (moveCount < 12) actions.push(`opening:${Math.min(moveCount, 11)}:${toSq}`);
  if (board[nr][nc]) actions.push('capture');
  if (piece.type === 'K' && Math.abs(nc - c) === 2) actions.push(nc > c ? 'castle:kingside' : 'castle:queenside');
  if (piece.type === 'P') {
    actions.push(`pawnfile:${toSq[0]}`);
    if (Math.abs(nr - r) === 2) actions.push('pawn:double');
  }
  if ((piece.type === 'N' || piece.type === 'B') && moveCount < 12) actions.push('develop:minor');
  if ('cdef'.includes(toSq[0]) && ['3', '4', '5', '6'].includes(toSq[1])) actions.push('center');
  if ('abgh'.includes(toSq[0])) actions.push('wing');

  return actions;
}

function getChessStyleTraits(board: Board, r: number, c: number, nr: number, nc: number) {
  const piece = board[r][c];
  if (!piece) return {};

  const capture = Boolean(board[nr][nc]);
  const distance = Math.abs(nr - r) + Math.abs(nc - c);
  const centerFileDistance = Math.abs(3.5 - nc);

  return {
    aggression: capture ? 0.78 : piece.type === 'P' ? 0.52 : 0.46,
    risk: piece.type === 'Q' ? 0.72 : capture ? 0.6 : 0.38,
    exploration: distance >= 3 ? 0.68 : centerFileDistance <= 1.5 ? 0.42 : 0.56,
    precision: piece.type === 'N' || piece.type === 'B' ? 0.7 : 0.58,
  };
}

function getAdaptiveChessMove(
  board: Board,
  color: Color,
  ep: [number, number] | null,
  cr: CastlingRights,
  diff: Difficulty,
  moveCount: number,
  learning: { totalActions: number; traits: { aggression: number; risk: number; exploration: number } },
  getActionWeight: (action: string) => number
): [number, number, number, number] | null {
  if (learning.totalActions < 12) return getBestMove(board, color, ep, cr, diff);

  const depths: Record<Difficulty, number> = { easy: 2, medium: 3, hard: 5 };
  const depth = depths[diff];
  const moves = getAllLegalMoves(board, color, ep, cr);
  if (!moves.length) return null;

  const ranked = moves.map((move) => {
    const [r, c, nr, nc] = move;
    const piece = board[r][c]!;
    const nextBoard = copyBoard(board);
    applyMove(nextBoard, r, c, nr, nc, ep, cr, null);
    const evalScore = minimax(nextBoard, depth - 1, -Infinity, Infinity, color === 'w' ? 'b' : 'w', null, cr);
    const engineScore = color === 'w' ? evalScore : -evalScore;
    const actionBias = getChessStyleActions(board, r, c, nr, nc, moveCount)
      .reduce((sum, action) => sum + Math.max(0, getActionWeight(action) - 1), 0);
    const captureBias = board[nr][nc] ? (learning.traits.aggression - 0.5) * 0.22 : 0;
    const queenBias = piece.type === 'Q' ? (learning.traits.risk - 0.5) * 0.18 : 0;
    const explorationBias = (learning.traits.exploration - 0.5) * (Math.abs(nr - r) + Math.abs(nc - c) >= 3 ? 0.16 : 0.06);
    const styleBias = Math.min(0.75, actionBias * 0.09 + captureBias + queenBias + explorationBias);
    return { move, engineScore, finalScore: engineScore + styleBias };
  });

  const bestEngineScore = Math.max(...ranked.map((entry) => entry.engineScore));
  const tolerance = 0.18 + learning.traits.risk * 0.52 + learning.traits.exploration * 0.12;
  const shortlist = ranked.filter((entry) => bestEngineScore - entry.engineScore <= tolerance);
  shortlist.sort((a, b) => b.finalScore - a.finalScore);
  return shortlist[0]?.move ?? ranked.sort((a, b) => b.engineScore - a.engineScore)[0]?.move ?? null;
}

// ─── Game State ───────────────────────────────────────────────
interface ChessState {
  board: Board;
  turn: Color;
  cr: CastlingRights;
  ep: [number, number] | null;
  halfmove: number;
  history: string[]; // SAN
  selected: [number, number] | null;
  legalMoves: [number, number][];
  lastMove: [[number, number], [number, number]] | null;
  gameResult: string | null;
  promotionPending: { from: [number, number]; to: [number, number] } | null;
  capturedW: PieceType[]; // white pieces captured by black
  capturedB: PieceType[]; // black pieces captured by white
  undoStack: ChessSnapshot[];
  aiDisabled: boolean;
  evalScore: number; // in pawn units, white positive
  evalVisual: number; // lerped
  hintMove: [number, number, number, number] | null;
  lastMoveClassification: MoveClassification | null;
  prevEvalScore: number; // eval before last move (for classification)
  drawOffer: 'none' | 'w' | 'b'; // who is offering a draw
  resignConfirm: boolean; // whether resign confirmation is showing
  drawOfferFrom: 'player' | 'ai' | null; // source of the draw offer
  nearEqualMoves: number; // count of consecutive near-equal eval moves (for AI draw offers)
}

interface ChessSnapshot {
  board: Board;
  turn: Color;
  cr: CastlingRights;
  ep: [number, number] | null;
  halfmove: number;
  history: string[];
  capturedW: PieceType[];
  capturedB: PieceType[];
  lastMove: [[number, number], [number, number]] | null;
}

interface Premove {
  from: [number, number];
  to: [number, number];
}

function initChessState(): ChessState {
  return {
    board: makeBoard(), turn: 'w',
    cr: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null, halfmove: 0, history: [],
    selected: null, legalMoves: [], lastMove: null,
    gameResult: null, promotionPending: null,
    capturedW: [], capturedB: [],
    undoStack: [], aiDisabled: false,
    evalScore: 0, evalVisual: 0,
    hintMove: null, lastMoveClassification: null, prevEvalScore: 0,
    drawOffer: 'none', resignConfirm: false, drawOfferFrom: null, nearEqualMoves: 0,
  };
}

function makeMove(gs: ChessState, r: number, c: number, nr: number, nc: number, promote: PieceType = 'Q'): ChessState {
  const board = copyBoard(gs.board);
  const sq = board[r][c]!;
  const snap: ChessSnapshot = {
    board: copyBoard(gs.board), turn: gs.turn, cr: { ...gs.cr },
    ep: gs.ep, halfmove: gs.halfmove, history: [...gs.history],
    capturedW: [...gs.capturedW], capturedB: [...gs.capturedB],
    lastMove: gs.lastMove,
  };

  const newCr = { ...gs.cr };
  if (sq.type === 'K') { if (sq.color === 'w') { newCr.wK = false; newCr.wQ = false; } else { newCr.bK = false; newCr.bQ = false; } }
  if (sq.type === 'R') {
    if (r === 7 && c === 0) newCr.wQ = false; if (r === 7 && c === 7) newCr.wK = false;
    if (r === 0 && c === 0) newCr.bQ = false; if (r === 0 && c === 7) newCr.bK = false;
  }

  const isPromo = sq.type === 'P' && (nr === 0 || nr === 7);
  const newEP: [number, number] | null = sq.type === 'P' && Math.abs(nr - r) === 2 ? [(r + nr) / 2, c] : null;

  // Capture tracking
  const capturedPiece = board[nr][nc];
  const isEP = sq.type === 'P' && gs.ep && nr === gs.ep[0] && nc === gs.ep[1];
  const epCapture = isEP ? board[r][nc] : null;

  applyMove(board, r, c, nr, nc, gs.ep, newCr, isPromo ? promote : null);

  const newCapturedW = [...gs.capturedW];
  const newCapturedB = [...gs.capturedB];
  const cap = capturedPiece || epCapture;
  if (cap) {
    if (cap.color === 'w') newCapturedW.push(cap.type);
    else newCapturedB.push(cap.type);
  }

  const nextTurn: Color = gs.turn === 'w' ? 'b' : 'w';
  const nextMoves = getAllLegalMoves(board, nextTurn, newEP, newCr);
  const inCheckNext = isInCheck(board, nextTurn);
  let result: string | null = null;
  if (nextMoves.length === 0) result = inCheckNext ? (nextTurn === 'b' ? 'White wins by checkmate' : 'Black wins by checkmate') : 'Draw by stalemate';
  const newHalf = (sq.type === 'P' || cap) ? 0 : gs.halfmove + 1;
  if (newHalf >= 100) result = 'Draw by 50-move rule';

  const san = toSAN(gs.board, r, c, nr, nc, isPromo ? promote : null, inCheckNext && result === null, result !== null && inCheckNext);
  const newHistory = [...gs.history, san];

  return {
    ...gs,
    board, turn: nextTurn, cr: newCr, ep: newEP, halfmove: newHalf,
    history: newHistory, selected: null, legalMoves: [],
    lastMove: [[r, c], [nr, nc]], gameResult: result,
    promotionPending: null,
    capturedW: newCapturedW, capturedB: newCapturedB,
    undoStack: [...gs.undoStack, snap],
    evalScore: gs.evalScore, evalVisual: gs.evalVisual,
    aiDisabled: gs.aiDisabled,
    hintMove: null, lastMoveClassification: gs.lastMoveClassification, prevEvalScore: gs.prevEvalScore,
  };
}

function undoMove(gs: ChessState, steps: number = 1): ChessState {
  const stack = [...gs.undoStack];
  let snap: ChessSnapshot | undefined;
  for (let i = 0; i < steps && stack.length; i++) snap = stack.pop();
  if (!snap) return gs;
  return {
    ...gs,
    board: snap.board, turn: snap.turn, cr: snap.cr, ep: snap.ep,
    halfmove: snap.halfmove, history: snap.history,
    capturedW: snap.capturedW, capturedB: snap.capturedB,
    lastMove: snap.lastMove,
    selected: null, legalMoves: [], gameResult: null, promotionPending: null,
    undoStack: stack, aiDisabled: gs.aiDisabled,
    evalScore: gs.evalScore, evalVisual: gs.evalVisual,
  };
}

function getProjectedStateForPremoves(gs: ChessState, premoves: Premove[]) {
  const board = copyBoard(gs.board);
  let ep = gs.ep;
  let cr = { ...gs.cr };

  for (const move of premoves) {
    const sq = board[move.from[0]][move.from[1]];
    if (!sq) break;

    const nextCr = { ...cr };
    if (sq.type === 'K') {
      if (sq.color === 'w') { nextCr.wK = false; nextCr.wQ = false; }
      else { nextCr.bK = false; nextCr.bQ = false; }
    }
    if (sq.type === 'R') {
      if (move.from[0] === 7 && move.from[1] === 0) nextCr.wQ = false;
      if (move.from[0] === 7 && move.from[1] === 7) nextCr.wK = false;
      if (move.from[0] === 0 && move.from[1] === 0) nextCr.bQ = false;
      if (move.from[0] === 0 && move.from[1] === 7) nextCr.bK = false;
    }

    const promote = sq.type === 'P' && (move.to[0] === 0 || move.to[0] === 7) ? 'Q' : null;
    applyMove(board, move.from[0], move.from[1], move.to[0], move.to[1], ep, nextCr, promote);
    ep = sq.type === 'P' && Math.abs(move.to[0] - move.from[0]) === 2 ? [(move.from[0] + move.to[0]) / 2, move.from[1]] : null;
    cr = nextCr;
  }

  return { board, ep, cr };
}

function trimPremovesFromSquare(premoves: Premove[], square: [number, number]): Premove[] {
  const index = premoves.findIndex((move) => move.from[0] === square[0] && move.from[1] === square[1]);
  if (index < 0) return premoves;
  // Cancels the clicked premove and every premove queued after it.
  return premoves.slice(0, index);
}

// ─── Canvas Piece Drawing ─────────────────────────────────────
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function piecePalette(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, isWhite: boolean) {
  const fill = ctx.createLinearGradient(x, y, x, y + size);
  if (isWhite) {
    fill.addColorStop(0, '#fffdfa');
    fill.addColorStop(0.55, '#f1e8da');
    fill.addColorStop(1, '#d8c8af');
  } else {
    fill.addColorStop(0, '#4d5158');
    fill.addColorStop(0.45, '#1f232a');
    fill.addColorStop(1, '#08090c');
  }
  return {
    fill,
    stroke: isWhite ? '#2f2417' : '#d8d2c8',
    accent: isWhite ? '#fff7eb' : '#6f7784',
    shadow: isWhite ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.58)',
  };
}

function fillAndStrokePiece(ctx: CanvasRenderingContext2D, fill: CanvasGradient, stroke: string, lineWidth: number) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawPieceBase(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: CanvasGradient, stroke: string) {
  roundedRect(ctx, x + size * 0.18, y + size * 0.76, size * 0.64, size * 0.1, size * 0.03);
  fillAndStrokePiece(ctx, fill, stroke, size * 0.028);
  roundedRect(ctx, x + size * 0.24, y + size * 0.68, size * 0.52, size * 0.09, size * 0.03);
  fillAndStrokePiece(ctx, fill, stroke, size * 0.026);
}

function drawPawnShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: CanvasGradient, stroke: string, accent: string) {
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.26, size * 0.11, 0, Math.PI * 2);
  fillAndStrokePiece(ctx, fill, stroke, size * 0.028);

  ctx.beginPath();
  ctx.moveTo(x + size * 0.38, y + size * 0.42);
  ctx.bezierCurveTo(x + size * 0.3, y + size * 0.48, x + size * 0.29, y + size * 0.6, x + size * 0.35, y + size * 0.68);
  ctx.lineTo(x + size * 0.65, y + size * 0.68);
  ctx.bezierCurveTo(x + size * 0.71, y + size * 0.6, x + size * 0.7, y + size * 0.48, x + size * 0.62, y + size * 0.42);
  ctx.closePath();
  fillAndStrokePiece(ctx, fill, stroke, size * 0.03);

  ctx.strokeStyle = accent;
  ctx.lineWidth = size * 0.018;
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.52, size * 0.13, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

function drawRookShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: CanvasGradient, stroke: string, accent: string) {
  roundedRect(ctx, x + size * 0.3, y + size * 0.2, size * 0.4, size * 0.11, size * 0.02);
  fillAndStrokePiece(ctx, fill, stroke, size * 0.026);
  for (let i = 0; i < 3; i++) {
    roundedRect(ctx, x + size * (0.26 + i * 0.15), y + size * 0.13, size * 0.1, size * 0.09, size * 0.015);
    fillAndStrokePiece(ctx, fill, stroke, size * 0.024);
  }
  roundedRect(ctx, x + size * 0.32, y + size * 0.31, size * 0.36, size * 0.36, size * 0.04);
  fillAndStrokePiece(ctx, fill, stroke, size * 0.03);

  ctx.strokeStyle = accent;
  ctx.lineWidth = size * 0.018;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + size * (0.42 + i * 0.12), y + size * 0.36);
    ctx.lineTo(x + size * (0.42 + i * 0.12), y + size * 0.63);
    ctx.stroke();
  }
}

function drawKnightShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: CanvasGradient, stroke: string, accent: string, isWhite: boolean) {
  ctx.beginPath();
  ctx.moveTo(x + size * 0.34, y + size * 0.7);
  ctx.lineTo(x + size * 0.66, y + size * 0.7);
  ctx.lineTo(x + size * 0.62, y + size * 0.58);
  ctx.bezierCurveTo(x + size * 0.77, y + size * 0.5, x + size * 0.73, y + size * 0.25, x + size * 0.52, y + size * 0.2);
  ctx.bezierCurveTo(x + size * 0.45, y + size * 0.14, x + size * 0.4, y + size * 0.18, x + size * 0.38, y + size * 0.24);
  ctx.bezierCurveTo(x + size * 0.35, y + size * 0.33, x + size * 0.46, y + size * 0.38, x + size * 0.46, y + size * 0.44);
  ctx.bezierCurveTo(x + size * 0.41, y + size * 0.45, x + size * 0.34, y + size * 0.5, x + size * 0.32, y + size * 0.58);
  ctx.closePath();
  fillAndStrokePiece(ctx, fill, stroke, size * 0.03);

  ctx.fillStyle = isWhite ? '#3c2d18' : '#d7d0c5';
  ctx.beginPath();
  ctx.arc(x + size * 0.56, y + size * 0.29, size * 0.018, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = size * 0.016;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.47, y + size * 0.3);
  ctx.quadraticCurveTo(x + size * 0.59, y + size * 0.33, x + size * 0.62, y + size * 0.47);
  ctx.stroke();
}

function drawBishopShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: CanvasGradient, stroke: string, accent: string) {
  ctx.beginPath();
  ctx.moveTo(x + size * 0.5, y + size * 0.14);
  ctx.lineTo(x + size * 0.57, y + size * 0.24);
  ctx.lineTo(x + size * 0.5, y + size * 0.34);
  ctx.lineTo(x + size * 0.43, y + size * 0.24);
  ctx.closePath();
  fillAndStrokePiece(ctx, fill, stroke, size * 0.026);

  ctx.beginPath();
  ctx.moveTo(x + size * 0.5, y + size * 0.26);
  ctx.bezierCurveTo(x + size * 0.65, y + size * 0.35, x + size * 0.68, y + size * 0.55, x + size * 0.58, y + size * 0.68);
  ctx.lineTo(x + size * 0.42, y + size * 0.68);
  ctx.bezierCurveTo(x + size * 0.32, y + size * 0.55, x + size * 0.35, y + size * 0.35, x + size * 0.5, y + size * 0.26);
  ctx.closePath();
  fillAndStrokePiece(ctx, fill, stroke, size * 0.03);

  ctx.strokeStyle = accent;
  ctx.lineWidth = size * 0.016;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.46, y + size * 0.23);
  ctx.lineTo(x + size * 0.56, y + size * 0.59);
  ctx.stroke();
}

function drawQueenShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: CanvasGradient, stroke: string, accent: string) {
  const jewels = [0.28, 0.4, 0.5, 0.6, 0.72];
  jewels.forEach((px, index) => {
    ctx.beginPath();
    ctx.arc(x + size * px, y + size * (index === 2 ? 0.12 : 0.16), size * (index === 2 ? 0.05 : 0.04), 0, Math.PI * 2);
    fillAndStrokePiece(ctx, fill, stroke, size * 0.02);
  });

  ctx.beginPath();
  ctx.moveTo(x + size * 0.3, y + size * 0.25);
  ctx.lineTo(x + size * 0.38, y + size * 0.52);
  ctx.lineTo(x + size * 0.46, y + size * 0.33);
  ctx.lineTo(x + size * 0.5, y + size * 0.55);
  ctx.lineTo(x + size * 0.54, y + size * 0.33);
  ctx.lineTo(x + size * 0.62, y + size * 0.52);
  ctx.lineTo(x + size * 0.7, y + size * 0.25);
  ctx.lineTo(x + size * 0.66, y + size * 0.68);
  ctx.lineTo(x + size * 0.34, y + size * 0.68);
  ctx.closePath();
  fillAndStrokePiece(ctx, fill, stroke, size * 0.03);

  ctx.strokeStyle = accent;
  ctx.lineWidth = size * 0.015;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.39, y + size * 0.41);
  ctx.lineTo(x + size * 0.61, y + size * 0.41);
  ctx.stroke();
}

function drawKingShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: CanvasGradient, stroke: string, accent: string) {
  ctx.beginPath();
  ctx.moveTo(x + size * 0.5, y + size * 0.1);
  ctx.lineTo(x + size * 0.5, y + size * 0.24);
  ctx.moveTo(x + size * 0.43, y + size * 0.17);
  ctx.lineTo(x + size * 0.57, y + size * 0.17);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = size * 0.04;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + size * 0.37, y + size * 0.28);
  ctx.bezierCurveTo(x + size * 0.31, y + size * 0.38, x + size * 0.31, y + size * 0.57, x + size * 0.4, y + size * 0.68);
  ctx.lineTo(x + size * 0.6, y + size * 0.68);
  ctx.bezierCurveTo(x + size * 0.69, y + size * 0.57, x + size * 0.69, y + size * 0.38, x + size * 0.63, y + size * 0.28);
  ctx.closePath();
  fillAndStrokePiece(ctx, fill, stroke, size * 0.03);

  ctx.strokeStyle = accent;
  ctx.lineWidth = size * 0.017;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.39, y + size * 0.42);
  ctx.lineTo(x + size * 0.61, y + size * 0.42);
  ctx.stroke();
}

function drawPiece(ctx: CanvasRenderingContext2D, type: PieceType, isWhite: boolean, x: number, y: number, size: number) {
  const palette = piecePalette(ctx, x, y, size, isWhite);
  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = size * 0.08;
  ctx.shadowOffsetX = size * 0.02;
  ctx.shadowOffsetY = size * 0.05;

  drawPieceBase(ctx, x, y, size, palette.fill, palette.stroke);

  switch (type) {
    case 'P':
      drawPawnShape(ctx, x, y, size, palette.fill, palette.stroke, palette.accent);
      break;
    case 'R':
      drawRookShape(ctx, x, y, size, palette.fill, palette.stroke, palette.accent);
      break;
    case 'N':
      drawKnightShape(ctx, x, y, size, palette.fill, palette.stroke, palette.accent, isWhite);
      break;
    case 'B':
      drawBishopShape(ctx, x, y, size, palette.fill, palette.stroke, palette.accent);
      break;
    case 'Q':
      drawQueenShape(ctx, x, y, size, palette.fill, palette.stroke, palette.accent);
      break;
    case 'K':
      drawKingShape(ctx, x, y, size, palette.fill, palette.stroke, palette.accent);
      break;
  }

  ctx.restore();
}

// ─── Setup screens ────────────────────────────────────────────
type SetupPhase = 'mode' | 'color' | 'difficulty' | 'time' | 'load';
type GameMode = 'pvp' | 'ai';

interface SetupState {
  mode: GameMode;
  playerColor: Color;
  difficulty: Difficulty;
  timeControl: TimeControl;
  initialMinutes: number;
  increment: number;
}

// ─── UI Sub-components ────────────────────────────────────────
function TurnBox({ turn, inCheck, gameResult }: { turn: Color; inCheck: boolean; gameResult: string | null }) {
  return (
    <div style={{ background: '#1a1a2e', borderRadius: 6, padding: '6px 10px', textAlign: 'center', flexShrink: 0 }}>
      <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>TURN</div>
      <div style={{ fontSize: 14, fontWeight: 'bold', color: turn === 'w' ? '#fff' : '#aaa' }}>
        {gameResult ? '—' : turn === 'w' ? '⬜ White' : '⬛ Black'}
      </div>
      {inCheck && !gameResult && (
        <div style={{ color: '#ff6b6b', fontSize: 11, fontWeight: 'bold', marginTop: 2 }}>CHECK!</div>
      )}
    </div>
  );
}

function MoveHistory({ history, maxH }: { history: string[]; maxH: number }) {
  return (
    <div style={{ background: '#1a1a2e', borderRadius: 6, padding: '4px 6px', flex: 1, minHeight: 0 }}>
      <div style={{ fontSize: 9, color: '#aaa', marginBottom: 2, fontWeight: 'bold' }}>MOVES</div>
      <div style={{ height: maxH, overflowY: 'auto', fontSize: 11, fontFamily: 'monospace' }}
        ref={(el: HTMLDivElement | null) => { if (el) el.scrollTop = el.scrollHeight; }}>
        {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 4 }}>
            <span style={{ color: '#555', minWidth: 24 }}>{i + 1}.</span>
            <span style={{ color: '#fff', minWidth: 46 }}>{history[i * 2]}</span>
            {history[i * 2 + 1] && <span style={{ color: '#aaa' }}>{history[i * 2 + 1]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PromotionOverlay({ isWhite, sq, onPick }: { isWhite: boolean; sq: number; onPick: (t: PieceType) => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
      <div style={{ background: '#222', padding: 12, borderRadius: 8, display: 'flex', gap: 8 }}>
        {(['Q', 'R', 'B', 'N'] as PieceType[]).map(t => (
          <button key={t} onClick={() => onPick(t)}
            style={{ width: sq, height: sq, background: '#333', border: '1px solid #555', borderRadius: 6, cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
            <canvas width={sq} height={sq}
              ref={el => { if (el) { const c = el.getContext('2d')!; c.clearRect(0, 0, sq, sq); drawPiece(c, t, isWhite, 0, 0, sq); } }}
              style={{ display: 'block' }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function GameOverOverlay({ result, onPlayAgain, onMenu, onAnalyze, onSave }: {
  result: string; onPlayAgain: () => void; onMenu: () => void;
  onAnalyze?: (depth: 2 | 3 | 4) => void; onSave?: () => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: 10, padding: '0 12px' }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: result.includes('Draw') ? '#ffd700' : '#4caf50', textAlign: 'center' }}>
        {result}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={onPlayAgain} style={{ padding: '7px 14px', fontSize: 13, background: '#3a6186', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Play Again</button>
        {onSave && <button onClick={onSave} style={{ padding: '7px 14px', fontSize: 13, background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>💾 Save</button>}
        <button onClick={onMenu} style={{ padding: '7px 14px', fontSize: 13, background: '#555', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Menu</button>
      </div>
      {onAnalyze && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 11, color: '#aaa' }}>🔍 Analyze Game</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onAnalyze(2)} style={{ padding: '5px 10px', fontSize: 12, background: '#1565c0', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>Quick (d2)</button>
            <button onClick={() => onAnalyze(3)} style={{ padding: '5px 10px', fontSize: 12, background: '#1565c0', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>Normal (d3)</button>
            <button onClick={() => onAnalyze(4)} style={{ padding: '5px 10px', fontSize: 12, background: '#1565c0', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>Deep (d4)</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Analysis helpers ─────────────────────────────────────────
function buildAnalysisEntries(gs: ChessState): AnalysisEntry[] {
  // Build list of positions from undoStack (each snapshot) + final state
  const snaps = gs.undoStack;
  const entries: AnalysisEntry[] = [];
  // Initial position (before move 1)
  if (snaps.length > 0) {
    const first = snaps[0];
    entries.push({
      board: first.board, turn: first.turn, cr: first.cr, ep: first.ep,
      history: first.history, capturedW: first.capturedW, capturedB: first.capturedB,
      lastMove: first.lastMove,
      evalScore: null, bestMove: null, classification: null, moveIdx: 0,
    });
  }
  // After each move (snapshots are pre-move states, so snap[i] -> snap[i+1].lastMove is the move)
  for (let i = 1; i < snaps.length; i++) {
    const snap = snaps[i];
    entries.push({
      board: snap.board, turn: snap.turn, cr: snap.cr, ep: snap.ep,
      history: snap.history, capturedW: snap.capturedW, capturedB: snap.capturedB,
      lastMove: snap.lastMove,
      evalScore: null, bestMove: null, classification: null, moveIdx: i,
    });
  }
  // Final position
  entries.push({
    board: gs.board, turn: gs.turn, cr: gs.cr, ep: gs.ep,
    history: gs.history, capturedW: gs.capturedW, capturedB: gs.capturedB,
    lastMove: gs.lastMove,
    evalScore: null, bestMove: null, classification: null, moveIdx: snaps.length,
  });
  return entries;
}

// ─── Save helpers ─────────────────────────────────────────────
function buildSaveLabel(gs: ChessState, setup: SetupState): string {
  const moveCount = gs.history.length;
  const now = new Date();
  const dateStr = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const modeStr = setup.mode === 'pvp' ? 'PvP' : `vs AI (${setup.difficulty})`;
  return `Move ${moveCount} · ${modeStr} · ${dateStr}`;
}

function saveGameToStorage(saves: SavedGame[], gs: ChessState, setup: SetupState, analysis: AnalysisState | null, customName: string): SavedGame[] {
  const id = `save_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const finalLabel = customName.trim() || buildSaveLabel(gs, setup);

  const newSave: SavedGame = {
    id,
    savedAt: new Date().toISOString(),
    label: finalLabel,
    setupMode: setup.mode,
    setupDifficulty: setup.difficulty,
    setupPlayerColor: setup.playerColor,
    setupTimeControl: setup.timeControl,
    moveCount: gs.history.length,
    gameResult: gs.gameResult,
    boardJson: JSON.stringify(gs.board),
    historyJson: JSON.stringify(gs.history),
    evalScore: gs.evalScore,
    fullStateJson: JSON.stringify(gs),
    // Additional fields for analysis saves
    isAnalysis: analysis !== null,
    analysisJson: analysis ? JSON.stringify(analysis) : undefined,
  };
  const next = [newSave, ...saves].slice(0, MAX_SAVES);
  persistSaves(next);
  return next;
}

// ─── Main component ───────────────────────────────────────────
export function ChessGame() {
  const { recordGame, checkAchievements } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, learning, mode: demoMode, cycleMode, getAdaptiveDelay, getActionWeight, recordPlayerAction } = useAIDemo('chess');
  const aiOnRef = useRef(aiDemoMode);
  const demoLabel = demoMode === 'adaptive' ? '🧠 Learn Me' : aiDemoMode ? '🤖 Classic AI' : '🎮 Demo Off';
  const lastMoveSourceRef = useRef<'player' | 'ai' | 'premove' | null>(null);

  const [setup, setSetup] = useState<SetupState | null>(null);
  const [phase, setPhase] = useState<SetupPhase>('mode');
  const [pendingSetup, setPendingSetup] = useState<Partial<SetupState>>({});
  const [pvpTimers, setPvpTimers] = useState<{ w: number; b: number; inc: number } | null>(null);
  const pvpTimersRef = useRef<{ w: number; b: number; inc: number } | null>(null);
  pvpTimersRef.current = pvpTimers;

  const [gs, setGs] = useState<ChessState>(initChessState);
  const gsRef = useRef(gs);
  gsRef.current = gs;

  const startTimeRef = useRef(Date.now());
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ piece: { type: PieceType; color: Color }; fromR: number; fromC: number; x: number; y: number } | null>(null);

  // Analysis state
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;

  // Arrows and Premoves
  const [arrows, setArrows] = useState<{ from: [number, number], to: [number, number] }[]>([]);
  const [premoves, setPremoves] = useState<Premove[]>([]);
  const arrowStartRef = useRef<[number, number] | null>(null);

  // Save/load state
  const [savedGames, setSavedGames] = useState<SavedGame[]>(() => loadSavedGames());
  const [showAllSaves, setShowAllSaves] = useState(false);
  const [saveToast, setSaveToast] = useState('');

  // Eval bar lerp animation
  useEffect(() => {
    const lerp = () => {
      setGs(prev => {
        if (Math.abs(prev.evalVisual - prev.evalScore) < 0.01) return prev;
        return { ...prev, evalVisual: prev.evalVisual + (prev.evalScore - prev.evalVisual) * 0.12 };
      });
      rafRef.current = requestAnimationFrame(lerp);
    };
    rafRef.current = requestAnimationFrame(lerp);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const playerColor = setup?.playerColor ?? 'w';
  const gameMode = setup?.mode ?? 'pvp';
  const difficulty = setup?.difficulty ?? 'medium';
  const flip = gameMode === 'ai' ? playerColor === 'b' : gs.turn === 'b';
  const projectedPremoveState = useMemo(
    () => getProjectedStateForPremoves(gs, premoves),
    [gs, premoves]
  );

  // Responsive square size — fill available width on mobile
  const [winW, setWinW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // On narrow screens (<520px): fit board to screen minus small margins
  // evalBar=28px + 6margin, sidebar goes below so doesn't count
  const isMobile = true;
  const SQ = useMemo(() => {
    const evalBarW = gameMode === 'ai' ? 34 : 0;
    const available = winW - evalBarW - 12; // 12px total padding
    return Math.floor(Math.min(available, 416) / 8);
  }, [winW, gameMode]);
  const BOARD_PX = SQ * 8;

  // Analysis display data
  const anaEntry = analysis ? analysis.entries[analysis.currentIdx] : null;
  const anaCapW = anaEntry ? anaEntry.capturedW : gs.capturedW;
  const anaCapB = anaEntry ? anaEntry.capturedB : gs.capturedB;
  const displayCapW: Partial<Record<PieceType, number>> = {};
  const displayCapB: Partial<Record<PieceType, number>> = {};
  anaCapW.forEach(p => displayCapW[p] = (displayCapW[p] ?? 0) + 1);
  anaCapB.forEach(p => displayCapB[p] = (displayCapB[p] ?? 0) + 1);

  // Eval bar calculations
  const currentEvalScore = (analysis && anaEntry && anaEntry.evalScore !== null) ? anaEntry.evalScore : gs.evalScore;
  const currentEvalVisual = (analysis && anaEntry && anaEntry.evalScore !== null) ? anaEntry.evalScore : gs.evalVisual;
  const evalClamped = Math.max(-15, Math.min(15, currentEvalVisual));
  const evalNorm = (evalClamped + 15) / 30; // 0=black winning, 1=white winning

  // Score label: show "+2.4", "-1.0", "0.0", or "M3" / "-M3"
  const evalLabel = useMemo(() => {
    const raw = currentEvalScore;
    if (Math.abs(raw) >= 9000) {
      // Mate score
      const mateIn = Math.round(10000 - Math.abs(raw));
      return raw > 0 ? `M${mateIn}` : `-M${mateIn}`;
    }
    if (raw === 0) return '0.0';
    const sign = raw > 0 ? '+' : '';
    return `${sign}${raw.toFixed(1)}`;
  }, [currentEvalScore]);

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // During analysis, show the analysis position; otherwise show live game
    const ana = analysisRef.current;
    const g = ana
      ? {
        ...gs, board: ana.entries[ana.currentIdx].board, turn: ana.entries[ana.currentIdx].turn,
        lastMove: ana.entries[ana.currentIdx].lastMove, selected: null, legalMoves: [],
        capturedW: ana.entries[ana.currentIdx].capturedW, capturedB: ana.entries[ana.currentIdx].capturedB
      }
      : gs;
    const drag = ana ? null : dragRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let sr = 0; sr < 8; sr++) for (let sc = 0; sc < 8; sc++) {
      const br = flip ? 7 - sr : sr;
      const bc = flip ? 7 - sc : sc;
      const x = sc * SQ, y = sr * SQ;
      const isLight = (sr + sc) % 2 === 0;
      ctx.fillStyle = isLight ? '#f0d9b5' : '#b58863';
      ctx.fillRect(x, y, SQ, SQ);

      // Last move highlight
      if (g.lastMove && ((g.lastMove[0][0] === br && g.lastMove[0][1] === bc) || (g.lastMove[1][0] === br && g.lastMove[1][1] === bc))) {
        ctx.fillStyle = 'rgba(255,230,60,0.45)';
        ctx.fillRect(x, y, SQ, SQ);
      }

      // Selected highlight
      if (g.selected && g.selected[0] === br && g.selected[1] === bc) {
        ctx.fillStyle = 'rgba(80,200,80,0.5)';
        ctx.fillRect(x, y, SQ, SQ);
      }

      // Check highlight
      const sq = g.board[br][bc];
      if (sq?.type === 'K' && sq.color === g.turn && isInCheck(g.board, g.turn)) {
        ctx.fillStyle = 'rgba(220,60,60,0.5)';
        ctx.fillRect(x, y, SQ, SQ);
      }

      // Legal move markers
      if (g.legalMoves.some(([lr, lc]) => lr === br && lc === bc)) {
        if (g.board[br][bc]) {
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, SQ - 4, SQ - 4);
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.arc(x + SQ / 2, y + SQ / 2, SQ / 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw piece (skip dragging piece)
      const piece = g.board[br][bc];
      if (piece && !(drag && drag.fromR === br && drag.fromC === bc)) {
        drawPiece(ctx, piece.type, piece.color === 'w', x, y, SQ);
      }
    }

    // Draw dragging piece on top
    if (drag) {
      const px = drag.x - SQ / 2, py = drag.y - SQ / 2;
      drawPiece(ctx, drag.piece.type, drag.piece.color === 'w', px, py, SQ);
    }

    // Hint arrow (blue) — only when not in analysis
    if (!ana && gs.hintMove) {
      const [hr, hc, hnr, hnc] = gs.hintMove;
      drawArrow(ctx, hr, hc, hnr, hnc, flip, SQ, 'rgba(30,120,255,0.80)');
    }

    // Analysis best-move arrow (green)
    if (ana) {
      const entry = ana.entries[ana.currentIdx];
      if (entry.bestMove) {
        const [hr, hc, hnr, hnc] = entry.bestMove;
        drawArrow(ctx, hr, hc, hnr, hnc, flip, SQ, 'rgba(40,200,80,0.80)');
      }
      // Classification badge at destination of last move
      if (entry.classification && entry.lastMove) {
        const [, , toR, toC] = [entry.lastMove[0][0], entry.lastMove[0][1], entry.lastMove[1][0], entry.lastMove[1][1]];
        const sc2 = flip ? 7 - toC : toC;
        const sr2 = flip ? 7 - toR : toR;
        const bx = sc2 * SQ + SQ - SQ * 0.28;
        const by = sr2 * SQ + SQ * 0.22;
        const r2 = SQ * 0.22;
        const cl = entry.classification;
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, r2, 0, Math.PI * 2);
        ctx.fillStyle = BADGE_COLORS[cl];
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(8, Math.round(SQ * 0.2))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(BADGE_SYMBOLS[cl], bx, by);
        ctx.restore();
      }
    }

    // Draw premove queue
    if (!ana) {
      premoves.forEach((premove, index) => {
        ctx.fillStyle = index === 0 ? 'rgba(220, 60, 60, 0.45)' : 'rgba(220, 60, 60, 0.25)';
        const r1 = flip ? 7 - premove.from[0] : premove.from[0];
        const c1 = flip ? 7 - premove.from[1] : premove.from[1];
        const r2 = flip ? 7 - premove.to[0] : premove.to[0];
        const c2 = flip ? 7 - premove.to[1] : premove.to[1];
        ctx.fillRect(c1 * SQ, r1 * SQ, SQ, SQ);
        ctx.fillRect(c2 * SQ, r2 * SQ, SQ, SQ);
        drawArrow(ctx, premove.from[0], premove.from[1], premove.to[0], premove.to[1], flip, SQ, index === 0 ? 'rgba(220, 60, 60, 0.85)' : 'rgba(220, 60, 60, 0.55)');
      });
    }

    // Draw Arrows
    arrows.forEach(a => {
      drawArrow(ctx, a.from[0], a.from[1], a.to[0], a.to[1], flip, SQ, 'rgba(255,170,0,0.8)');
    });

    // Coordinate labels (chess.com style — on square edges with contrast)
    const labelSize = Math.max(10, Math.round(SQ * 0.22));
    ctx.font = `bold ${labelSize}px 'Inter', 'Segoe UI', sans-serif`;
    for (let i = 0; i < 8; i++) {
      const file = flip ? 'hgfedcba'[i] : 'abcdefgh'[i];
      const rank = flip ? '12345678'[i] : '87654321'[i];
      // File labels at bottom of each column (last row)
      const isLightFile = (7 + i) % 2 === 0; // bottom-left square color
      ctx.fillStyle = isLightFile ? '#b58863' : '#f0d9b5';
      ctx.textAlign = 'center';
      ctx.fillText(file, i * SQ + SQ / 2, BOARD_PX - 3);
      // Rank labels on left side of each row
      const isLightRank = i % 2 === 0;
      ctx.fillStyle = isLightRank ? '#b58863' : '#f0d9b5';
      ctx.textAlign = 'left';
      ctx.fillText(rank, 3, i * SQ + labelSize + 2);
    }
  }, [gs, flip, SQ, BOARD_PX, analysis, premoves, arrows]);

  // Pointer helpers
  const toBoardSq = useCallback((canvasX: number, canvasY: number): [number, number] | null => {
    const sc = Math.floor(canvasX / SQ);
    const sr = Math.floor(canvasY / SQ);
    if (sc < 0 || sc > 7 || sr < 0 || sr > 7) return null;
    return flip ? [7 - sr, 7 - sc] : [sr, sc];
  }, [flip, SQ]);

  const getInteractionState = useCallback((g: ChessState) => {
    if (gameMode === 'ai' && g.turn !== playerColor) {
      return projectedPremoveState;
    }
    return { board: g.board, ep: g.ep, cr: g.cr };
  }, [gameMode, playerColor, projectedPremoveState]);

  const isMyPiece = useCallback((r: number, c: number): boolean => {
    const g = gsRef.current;
    const interaction = getInteractionState(g);
    const sq = interaction.board[r][c];
    if (!sq) return false;
    if (g.gameResult || g.promotionPending) return false;

    // In PvP, must only pick up the turn's pieces
    if (gameMode === 'pvp') return sq.color === g.turn;

    // In AI games, the user can ALWAYS pick up their own pieces (for moving or premoving)
    if (sq.color === playerColor) return true;

    // If AI self-play is disabled, allow picking up opponent's pieces if it's their turn
    if (!aiOnRef.current && g.aiDisabled) return sq.color === g.turn;

    return false;
  }, [gameMode, playerColor, getInteractionState]);

  // AI
  const runAI = useCallback((g: ChessState) => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      const aiColor = aiOnRef.current ? g.turn : (gameMode === 'pvp' ? g.turn : (playerColor === 'w' ? 'b' : 'w'));
      const move = isAdaptive
        ? getAdaptiveChessMove(g.board, aiColor, g.ep, g.cr, difficulty, g.history.length, learning, getActionWeight)
        : getBestMove(g.board, aiColor, g.ep, g.cr, difficulty);
      if (move) {
        const [r, c, nr, nc] = move;
        lastMoveSourceRef.current = 'ai';
        setGs(prev => {
          if (prev.gameResult || prev.turn !== aiColor) return prev;
          const next = makeMove(prev, r, c, nr, nc, 'Q');
          const dur = (Date.now() - startTimeRef.current) / 1000;
          if (next.gameResult) {
            const won = next.gameResult.includes('White') && playerColor === 'w' || next.gameResult.includes('Black') && playerColor === 'b';
            recordGame('chess', won, 0, dur);
            checkAchievements('chess', { won });
          }
          // Use depth-2 look-ahead for eval (computed async below)
          return { ...next, evalScore: next.evalScore };
        });
      }
    }, getAdaptiveDelay(300));
  }, [checkAchievements, difficulty, gameMode, getActionWeight, getAdaptiveDelay, isAdaptive, learning, playerColor, recordGame]);

  const queuePremove = useCallback((from: [number, number], to: [number, number]) => {
    setPremoves((prevPremoves) => {
      const nextPremoves = [...prevPremoves, { from, to }];
      setGs((prevGs) => {
        const nextProjected = getProjectedStateForPremoves(prevGs, nextPremoves);
        const legalMoves = nextProjected.board[to[0]][to[1]]
          ? getLegalMoves(nextProjected.board, to[0], to[1], nextProjected.ep, nextProjected.cr)
          : [];
        return { ...prevGs, selected: to, legalMoves };
      });
      return nextPremoves;
    });
  }, []);

  // Trigger AI when it's AI's turn
  useEffect(() => {
    if (!setup || gs.gameResult || gs.promotionPending) return;
    const aiColor = gameMode === 'pvp' ? null : (playerColor === 'w' ? 'b' : 'w');
    const shouldAI = aiOnRef.current || (gameMode === 'ai' && aiColor !== null && gs.turn === aiColor);
    if (shouldAI && !gs.aiDisabled) runAI(gs);
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.turn, gs.gameResult, gs.promotionPending, gs.aiDisabled, gameMode, playerColor, setup, runAI]);

  useEffect(() => {
    if (!setup || !aiDemoMode) return;
    setGs((prev) => prev.aiDisabled ? { ...prev, aiDisabled: false } : prev);
  }, [aiDemoMode, demoMode, setup]);

  useEffect(() => {
    aiOnRef.current = aiDemoMode;
  }, [aiDemoMode]);

  useEffect(() => {
    if (!setup || gs.gameResult || gs.promotionPending) return;
    const opponentColor = playerColor === 'w' ? 'b' : 'w';
    const shouldWakeAI = aiDemoMode || (gameMode === 'ai' && gs.turn === opponentColor);
    if (shouldWakeAI && gs.aiDisabled) {
      setGs((prev) => ({ ...prev, aiDisabled: false }));
    }
  }, [aiDemoMode, gameMode, gs.aiDisabled, gs.gameResult, gs.promotionPending, gs.turn, playerColor, setup]);

  // Keyboard: Ctrl+Z undo, stop AI on keydown
  useEffect(() => {
    if (!setup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        setPremoves([]);
        setGs(prev => {
          const steps = gameMode === 'ai' && prev.undoStack.length >= 2 ? 2 : 1;
          return { ...undoMove(prev, steps), evalScore: 0, evalVisual: 0 };
        });
      } else if (!e.ctrlKey && !e.altKey && !e.metaKey && aiOnRef.current) {
        setGs(g => ({ ...g, aiDisabled: true }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setup, gameMode]);

  // PvP timer tick
  useEffect(() => {
    if (!pvpTimers || !setup || gameMode !== 'pvp' || gs.gameResult || gs.history.length === 0) return;
    const interval = setInterval(() => {
      setPvpTimers(prev => {
        if (!prev) return null;
        const turn = gsRef.current?.turn ?? 'w';
        const next = { ...prev, [turn]: prev[turn] - 100 };
        if (next.w <= 0 && turn === 'w') {
          setGs(g => g.gameResult ? g : { ...g, gameResult: 'Black wins on time' });
          return { ...prev, w: 0 };
        }
        if (next.b <= 0 && turn === 'b') {
          setGs(g => g.gameResult ? g : { ...g, gameResult: 'White wins on time' });
          return { ...prev, b: 0 };
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [pvpTimers, setup, gameMode, gs.gameResult, gs.history.length]);

  // Better eval: depth-2 minimax look-ahead, async after each move
  useEffect(() => {
    if (!setup || gs.gameResult) return;
    const snapBoard = gs.board.map(r => r.map(s => s ? { ...s } : null));
    const snapTurn = gs.turn;
    const snapEp = gs.ep;
    const snapCr = { ...gs.cr };
    const id = setTimeout(() => {
      const score = minimax(snapBoard, 2, -Infinity, Infinity, snapTurn, snapEp, snapCr);
      setGs(prev => ({ ...prev, evalScore: score }));
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.history.length, gs.turn, setup]);

  // Blunder/move classification detection (AI mode only, fires after player's move)
  useEffect(() => {
    if (!setup || gameMode !== 'ai' || gs.history.length < 1) return;
    // Only classify player moves
    const lastMoveWasPlayer = gs.history.length % 2 !== 0
      ? (playerColor === 'w')  // white moved last on odd count
      : (playerColor === 'b');
    if (!lastMoveWasPlayer) return;

    const snapBoard = gs.board.map(r => r.map(s => s ? { ...s } : null));
    const snapTurn = gs.turn;
    const snapEp = gs.ep;
    const snapCr = { ...gs.cr };
    const prevScore = gs.prevEvalScore;

    const id = setTimeout(() => {
      // Current eval after player's move
      const currentScore = minimax(snapBoard, 2, -Infinity, Infinity, snapTurn, snapEp, snapCr);
      // Determine delta from player's perspective
      const fromWhitePerspective = playerColor === 'w';
      const delta = fromWhitePerspective ? (currentScore - prevScore) : (prevScore - currentScore);
      const classification = classifyMove(delta);

      setGs(prev => ({ ...prev, lastMoveClassification: classification, prevEvalScore: currentScore }));

      // classification stored for analysis only, no live toast
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.history.length]);

  useEffect(() => {
    if (!setup || gs.history.length < 1 || !gs.lastMove) return;
    const source = lastMoveSourceRef.current;
    if (source !== 'player' && source !== 'premove') return;

    const previousBoard = gs.undoStack[gs.undoStack.length - 1]?.board;
    const [[fromR, fromC], [toR, toC]] = gs.lastMove;
    const styleBoard = previousBoard ?? gs.board;
    const movedPiece = styleBoard[fromR][fromC] ?? gs.board[toR][toC];
    if (!movedPiece) return;
    if (gameMode === 'ai' && movedPiece.color !== playerColor) return;

    const actions = getChessStyleActions(styleBoard, fromR, fromC, toR, toC, Math.max(0, gs.history.length - 1));
    const traits = getChessStyleTraits(styleBoard, fromR, fromC, toR, toC);

    actions.forEach((action, index) => {
      recordPlayerAction(action, index === 0 ? traits : undefined);
    });
    lastMoveSourceRef.current = null;
  }, [gameMode, gs.board, gs.history.length, gs.lastMove, gs.undoStack, playerColor, recordPlayerAction, setup]);

  // Hint handler (AI mode only)
  const handleHint = useCallback(() => {
    if (gameMode !== 'ai') return;
    const g = gsRef.current;
    if (g.gameResult) return;
    const hintTimerId = setTimeout(() => {
      const move = getBestMove(g.board, playerColor, g.ep, g.cr, 'medium');
      if (move) {
        setGs(prev => ({ ...prev, hintMove: move }));
        // Auto-clear hint after 5s
        setTimeout(() => setGs(prev => ({ ...prev, hintMove: null })), 5000);
      }
    }, 0);
    return hintTimerId;
  }, [gameMode, playerColor]);

  // Execute Premove
  useEffect(() => {
    if (!setup || gameMode === 'pvp' || premoves.length === 0) return;
    if (gs.turn === playerColor && gs.history.length > 0) {
      const [nextPremove] = premoves;
      const legal = getLegalMoves(gs.board, nextPremove.from[0], nextPremove.from[1], gs.ep, gs.cr);
      const isLegal = legal.some(([lr, lc]) => lr === nextPremove.to[0] && lc === nextPremove.to[1]);

      if (isLegal) {
        const srcSq = gs.board[nextPremove.from[0]][nextPremove.from[1]]!;
        let promo: PieceType | undefined;
        if (srcSq.type === 'P' && (nextPremove.to[0] === 0 || nextPremove.to[0] === 7)) promo = 'Q';

        lastMoveSourceRef.current = 'premove';
        setGs(prev => {
          const next = makeMove(prev, nextPremove.from[0], nextPremove.from[1], nextPremove.to[0], nextPremove.to[1], promo);
          const dur = (Date.now() - startTimeRef.current) / 1000;
          if (next.gameResult) {
            const won = next.gameResult.includes('White') && playerColor === 'w' || next.gameResult.includes('Black') && playerColor === 'b';
            recordGame('chess', won, 0, dur);
            checkAchievements('chess', { won });
          }
          return { ...next, prevEvalScore: prev.evalScore, lastMoveClassification: null };
        });
        setPremoves((prev) => prev.slice(1));
      } else {
        setPremoves([]);
      }
    }
  }, [gs.turn, gs.board, gs.ep, gs.cr, gs.history.length, playerColor, gameMode, setup, premoves, recordGame, checkAchievements]);

  // Save handler
  const handleSave = useCallback(() => {
    if (!setup) return;
    const defaultName = buildSaveLabel(gsRef.current, setup);
    const customName = window.prompt('Enter a name for this save:', analysisRef.current ? `Analysis: ${defaultName}` : defaultName);
    if (customName === null) return; // cancelled

    setSavedGames(prev => {
      const next = saveGameToStorage(prev, gsRef.current, setup, analysisRef.current, customName);
      return next;
    });
    setSaveToast('💾 Saved!');
    setTimeout(() => setSaveToast(''), 2500);
  }, [setup]);

  // Load handler
  const handleLoad = useCallback((save: SavedGame) => {
    try {
      const restoredGs: ChessState = JSON.parse(save.fullStateJson);
      const restoredSetup: SetupState = {
        mode: save.setupMode, playerColor: save.setupPlayerColor,
        difficulty: save.setupDifficulty, timeControl: save.setupTimeControl,
        initialMinutes: 0, increment: 0,
      };
      setGs({ ...restoredGs, hintMove: null, lastMoveClassification: null, prevEvalScore: 0 });
      setSetup(restoredSetup);
      setPhase('mode');
      if (save.isAnalysis && save.analysisJson) {
        setAnalysis(JSON.parse(save.analysisJson));
      } else {
        setAnalysis(null);
      }
      setPvpTimers(null);
      setPremoves([]);
    } catch { /* corrupt save */ }
  }, []);

  // Analysis: start computing
  const startAnalysis = useCallback((depth: 2 | 3 | 4) => {
    const entries = buildAnalysisEntries(gsRef.current);
    setAnalysis({ entries, currentIdx: 0, isComputing: true, depth });

    // Compute evals + best moves one per tick
    let idx = 0;
    const computeNext = () => {
      if (idx >= entries.length) {
        setAnalysis(prev => prev ? { ...prev, isComputing: false } : null);
        return;
      }
      const entry = entries[idx];
      const currentIdx = idx;
      setTimeout(() => {
        const board = entry.board.map(r => r.map(s => s ? { ...s } : null));
        const score = minimax(board, depth, -Infinity, Infinity, entry.turn, entry.ep, entry.cr);
        // Find best move from this position
        let bestMoveForPos: [number, number, number, number] | null = null;
        {
          const allMoves = getAllLegalMoves(board, entry.turn, entry.ep, entry.cr);
          let bestVal = entry.turn === 'w' ? -Infinity : Infinity;
          for (const [r, c, nr, nc] of allMoves) {
            const nb = board.map(rw => rw.map(s => s ? { ...s } : null));
            applyMove(nb, r, c, nr, nc, entry.ep, entry.cr, null);
            const val = minimax(nb, Math.max(0, depth - 1), -Infinity, Infinity, entry.turn === 'w' ? 'b' : 'w', null, entry.cr);
            if (entry.turn === 'w' ? val > bestVal : val < bestVal) { bestVal = val; bestMoveForPos = [r, c, nr, nc]; }
          }
        }
        // Classify vs previous entry's eval
        let classification: MoveClassification | null = null;
        if (currentIdx > 0) {
          const prevEntry = entries[currentIdx - 1];
          if (prevEntry.evalScore !== null) {
            const movedColor = prevEntry.turn; // color that moved
            const delta = movedColor === 'w' ? (score - prevEntry.evalScore) : (prevEntry.evalScore - score);
            classification = classifyMove(delta);
          }
        }

        entries[currentIdx] = { ...entry, evalScore: score, bestMove: bestMoveForPos, classification };
        setAnalysis(prev => {
          if (!prev) return null;
          const newEntries = [...prev.entries];
          newEntries[currentIdx] = entries[currentIdx];
          return { ...prev, entries: newEntries };
        });
        idx++;
        computeNext();
      }, 0);
    };
    computeNext();
  }, []);

  // Keyboard navigation for analysis + ← → arrow keys
  useEffect(() => {
    if (!analysis) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setAnalysis(prev => prev ? { ...prev, currentIdx: Math.max(0, prev.currentIdx - 1) } : null);
      } else if (e.key === 'ArrowRight') {
        setAnalysis(prev => prev ? { ...prev, currentIdx: Math.min(prev.entries.length - 1, prev.currentIdx + 1) } : null);
      } else if (e.key === 'Escape') {
        setAnalysis(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [analysis]);

  // Removed auto-save on game end per user request

  // Pointer events on canvas
  const getCanvasXY = (e: React.MouseEvent | React.TouchEvent): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return null;
      return [(t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY];
    }
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const isRightClick = 'button' in e && e.button === 2;
    if (!isRightClick && !('touches' in e)) setArrows([]); // Left click clears arrows

    const xy = getCanvasXY(e);
    if (!xy) return;
    const [cx, cy] = xy;
    const sq = toBoardSq(cx, cy);
    if (!sq) return;
    const [r, c] = sq;

    if (isRightClick) {
      arrowStartRef.current = [r, c];
      return;
    }

    const g = gsRef.current;
    if (g.gameResult || g.promotionPending) return;
    const interaction = getInteractionState(g);

    if (gameMode === 'ai' && g.turn !== playerColor && premoves.length > 0) {
      const trimmed = trimPremovesFromSquare(premoves, [r, c]);
      if (trimmed.length !== premoves.length) {
        setPremoves(trimmed);
        setGs(prev => ({ ...prev, selected: null, legalMoves: [] }));
        return;
      }
    }

    if (isMyPiece(r, c)) {
      const piece = interaction.board[r][c]!;
      const legal = getLegalMoves(interaction.board, r, c, interaction.ep, interaction.cr);
      dragRef.current = { piece, fromR: r, fromC: c, x: cx, y: cy };
      if (aiOnRef.current && g.turn === playerColor) setGs(prev => ({ ...prev, aiDisabled: true }));
      setGs(prev => ({ ...prev, selected: [r, c], legalMoves: legal }));
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragRef.current) return;
    const xy = getCanvasXY(e);
    if (!xy) return;
    dragRef.current = { ...dragRef.current, x: xy[0], y: xy[1] };
    setGs(prev => ({ ...prev })); // trigger canvas redraw
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    const xy = getCanvasXY(e);

    // Handle Arrow Drawing end
    if (arrowStartRef.current) {
      if (xy) {
        const destSq = toBoardSq(xy[0], xy[1]);
        if (destSq) {
          const [sr, sc] = arrowStartRef.current;
          const [er, ec] = destSq;
          if (sr !== er || sc !== ec) {
            setArrows(prev => {
              const existingIdx = prev.findIndex(a => a.from[0] === sr && a.from[1] === sc && a.to[0] === er && a.to[1] === ec);
              if (existingIdx >= 0) {
                const next = [...prev]; next.splice(existingIdx, 1); return next;
              }
              return [...prev, { from: [sr, sc], to: [er, ec] }];
            });
          }
        }
      }
      arrowStartRef.current = null;
      return;
    }

    const drag = dragRef.current;
    dragRef.current = null;

    if (!xy || !drag) {
      // click without drag
      setGs(prev => ({ ...prev }));
      return;
    }
    const [cx, cy] = xy;
    const destSq = toBoardSq(cx, cy);
    if (!destSq) { setGs(prev => ({ ...prev, selected: null, legalMoves: [] })); return; }
    const [nr, nc] = destSq;
    const g = gsRef.current;
    const interaction = getInteractionState(g);

    if (drag.fromR === nr && drag.fromC === nc) {
      // Tap - if we already had this selected, deselect; else it's already set
      setGs(prev => ({ ...prev })); // just redraw
      return;
    }

    if (g.legalMoves.some(([lr, lc]) => lr === nr && lc === nc)) {
      const srcSq = interaction.board[drag.fromR][drag.fromC]!;
      if (srcSq.type === 'P' && (nr === 0 || nr === 7)) {
        if (g.turn !== srcSq.color) { // Premove promotion
          queuePremove([drag.fromR, drag.fromC], [nr, nc]);
        } else {
          setGs(prev => ({ ...prev, promotionPending: { from: [drag.fromR, drag.fromC], to: [nr, nc] } }));
        }
      } else {
        if (g.turn !== srcSq.color) { // Premove regular
          queuePremove([drag.fromR, drag.fromC], [nr, nc]);
        } else {
          lastMoveSourceRef.current = 'player';
          setGs(prev => {
            const justMoved = prev.turn;
            const next = makeMove(prev, drag.fromR, drag.fromC, nr, nc);
            const dur = (Date.now() - startTimeRef.current) / 1000;
            if (next.gameResult) {
              const won = next.gameResult.includes('White') && playerColor === 'w' || next.gameResult.includes('Black') && playerColor === 'b';
              recordGame('chess', won, 0, dur);
              checkAchievements('chess', { won });
            }
            if (gameMode === 'pvp') {
              setPvpTimers(t => t ? { ...t, [justMoved]: t[justMoved as 'w' | 'b'] + t.inc } : null);
            }
            return { ...next, prevEvalScore: prev.evalScore, lastMoveClassification: null };
          });
        }
      }
    } else if (isMyPiece(nr, nc)) {
      const legal = getLegalMoves(interaction.board, nr, nc, interaction.ep, interaction.cr);
      setGs(prev => ({ ...prev, selected: [nr, nc], legalMoves: legal }));
    } else {
      setGs(prev => ({ ...prev, selected: null, legalMoves: [] }));
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // Left click canvas (for tap interface without dragging)
    const isRightClick = e.button === 2;
    if (isRightClick) return; // Right clicks handled by pointerDown/Up arrows logic

    const xy = getCanvasXY(e);
    if (!xy) return;
    const [cx, cy] = xy;
    const sq = toBoardSq(cx, cy);
    if (!sq) return;
    const [r, c] = sq;
    const g = gsRef.current;
    if (g.gameResult || g.promotionPending) return;
    const interaction = getInteractionState(g);

    // If a piece was dragged (pointerup already handled), skip
    if (dragRef.current) return;

    if (gameMode === 'ai' && g.turn !== playerColor && premoves.length > 0) {
      const trimmed = trimPremovesFromSquare(premoves, [r, c]);
      if (trimmed.length !== premoves.length) {
        setPremoves(trimmed);
        setGs(prev => ({ ...prev, selected: null, legalMoves: [] }));
        return;
      }
    }

    if (g.selected) {
      const [sr, sc] = g.selected;
      if (g.legalMoves.some(([lr, lc]) => lr === r && lc === c)) {
        const srcSq = interaction.board[sr][sc]!;
        if (srcSq.type === 'P' && (r === 0 || r === 7)) {
          if (g.turn !== srcSq.color) { // Premove promotion
            queuePremove([sr, sc], [r, c]);
          } else {
            setGs(prev => ({ ...prev, promotionPending: { from: [sr, sc], to: [r, c] } }));
          }
        } else {
          if (g.turn !== srcSq.color) { // Premove regular
            queuePremove([sr, sc], [r, c]);
        } else {
          lastMoveSourceRef.current = 'player';
          setGs(prev => {
            const justMoved = prev.turn;
            const next = makeMove(prev, sr, sc, r, c);
              const dur = (Date.now() - startTimeRef.current) / 1000;
              if (next.gameResult) {
                const won = next.gameResult.includes('White') && playerColor === 'w' || next.gameResult.includes('Black') && playerColor === 'b';
                recordGame('chess', won, 0, dur);
                checkAchievements('chess', { won });
              }
              if (gameMode === 'pvp') {
                setPvpTimers(t => t ? { ...t, [justMoved]: t[justMoved as 'w' | 'b'] + t.inc } : null);
              }
              return { ...next, prevEvalScore: prev.evalScore, lastMoveClassification: null };
            });
            if (aiOnRef.current) setGs(prev => ({ ...prev, aiDisabled: true }));
          }
        }
      } else if (isMyPiece(r, c)) {
        const legal = getLegalMoves(interaction.board, r, c, interaction.ep, interaction.cr);
        setGs(prev => ({ ...prev, selected: [r, c], legalMoves: legal }));
      } else {
        setGs(prev => ({ ...prev, selected: null, legalMoves: [] }));
      }
    } else if (isMyPiece(r, c)) {
      const legal = getLegalMoves(interaction.board, r, c, interaction.ep, interaction.cr);
      setGs(prev => ({ ...prev, selected: [r, c], legalMoves: legal }));
      if (aiOnRef.current) setGs(prev => ({ ...prev, aiDisabled: true }));
    }
  };

  const handlePromotion = (type: PieceType) => {
    lastMoveSourceRef.current = 'player';
    setGs(prev => {
      if (!prev.promotionPending) return prev;
      const { from, to } = prev.promotionPending;
      const next = makeMove(prev, from[0], from[1], to[0], to[1], type);
      const dur = (Date.now() - startTimeRef.current) / 1000;
      if (next.gameResult) {
        const won = next.gameResult.includes('White') && playerColor === 'w' || next.gameResult.includes('Black') && playerColor === 'b';
        recordGame('chess', won, 0, dur);
        checkAchievements('chess', { won });
      }
      return { ...next, prevEvalScore: prev.evalScore, lastMoveClassification: null };
    });
  };

  const startNewGame = useCallback((s: SetupState) => {
    setSetup(s);
    setPhase('mode');
    setPendingSetup({});
    setAnalysis(null);
    startTimeRef.current = Date.now();
    setPremoves([]);
    const init = initChessState();
    // Init PvP timers
    if (s.mode === 'pvp' && s.initialMinutes > 0) {
      setPvpTimers({ w: s.initialMinutes * 60 * 1000, b: s.initialMinutes * 60 * 1000, inc: s.increment * 1000 });
    } else {
      setPvpTimers(null);
    }
    setGs(init);
  }, []);

  const toggleAI = useCallback(() => {
    setGs(g => ({ ...g, aiDisabled: false }));
    cycleMode();
  }, [cycleMode]);

  const handleUndo = useCallback(() => {
    setPremoves([]);
    setGs(prev => ({ ...undoMove(prev, gameMode === 'ai' ? 2 : 1), evalScore: 0, evalVisual: 0 }));
  }, [gameMode]);

  // Resign handler
  const handleResign = useCallback(() => {
    setGs(prev => {
      if (prev.gameResult) return prev;
      const loser = gameMode === 'ai' ? playerColor : prev.turn;
      const winner = loser === 'w' ? 'Black' : 'White';
      return { ...prev, gameResult: `${winner} wins by resignation`, resignConfirm: false };
    });
  }, [gameMode, playerColor]);

  // Draw offer handler
  const handleOfferDraw = useCallback(() => {
    if (gs.gameResult) return;
    if (gameMode === 'pvp') {
      // In PvP, offer draw to the other player
      setGs(prev => ({ ...prev, drawOffer: prev.turn, drawOfferFrom: 'player' }));
    } else {
      // In AI mode, player offers draw — AI decides
      const eval_ = gs.evalScore;
      const aiColor = playerColor === 'w' ? 'b' : 'w';
      const aiEval = aiColor === 'w' ? eval_ : -eval_;
      if (Math.abs(aiEval) <= 0.5) {
        // AI accepts the draw
        setGs(prev => ({ ...prev, gameResult: 'Draw by agreement', drawOffer: 'none', drawOfferFrom: null }));
      } else {
        // AI declines
        setSaveToast('🤖 AI declined the draw offer');
        setTimeout(() => setSaveToast(''), 2500);
      }
    }
  }, [gs.gameResult, gs.evalScore, gameMode, playerColor]);

  const handleAcceptDraw = useCallback(() => {
    setGs(prev => ({ ...prev, gameResult: 'Draw by agreement', drawOffer: 'none', drawOfferFrom: null }));
  }, []);

  const handleDeclineDraw = useCallback(() => {
    setGs(prev => ({ ...prev, drawOffer: 'none', drawOfferFrom: null }));
    if (gs.drawOfferFrom === 'ai') {
      setSaveToast('Draw offer declined');
      setTimeout(() => setSaveToast(''), 2000);
    }
  }, [gs.drawOfferFrom]);

  // AI draw offer logic (after AI moves, check if position is near-equal for several moves)
  useEffect(() => {
    if (!setup || gameMode !== 'ai' || gs.gameResult) return;
    if (gs.history.length < 20) return; // Don't offer draws too early
    const aiColor = playerColor === 'w' ? 'b' : 'w';
    if (gs.turn !== playerColor) return; // Only consider after AI has moved

    const eval_ = gs.evalScore;
    if (Math.abs(eval_) <= 0.3) {
      setGs(prev => {
        const newCount = prev.nearEqualMoves + 1;
        if (newCount >= 6 && prev.drawOffer === 'none' && Math.random() < 0.3) {
          return { ...prev, nearEqualMoves: newCount, drawOffer: aiColor, drawOfferFrom: 'ai' };
        }
        return { ...prev, nearEqualMoves: newCount };
      });
    } else {
      setGs(prev => ({ ...prev, nearEqualMoves: 0 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.history.length]);

  // Captured pieces & material display
  const capOrder: PieceType[] = ['Q', 'R', 'B', 'N', 'P'];
  const capCountW: Partial<Record<PieceType, number>> = {};
  const capCountB: Partial<Record<PieceType, number>> = {};
  gs.capturedW.forEach(p => capCountW[p] = (capCountW[p] ?? 0) + 1);
  gs.capturedB.forEach(p => capCountB[p] = (capCountB[p] ?? 0) + 1);

  const pieceVals: Record<PieceType, number> = { Q: 9, R: 5, B: 3, N: 3, P: 1, K: 0 };
  let wMat = 0, bMat = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = gs.board[r][c];
      if (p) {
        if (p.color === 'w') wMat += pieceVals[p.type];
        else bMat += pieceVals[p.type];
      }
    }
  }
  const matDiff = wMat - bMat;

  const pieceSymbols: Record<PieceType, string> = { Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟', K: '♚' };

  // ── Setup screens ────────────────────────────────────────────
  if (!setup) {
    const saveBtnStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, background: '#1a2a3a', color: '#ccc', border: '1px solid #334', borderRadius: 6, cursor: 'pointer', textAlign: 'left', width: '100%' };
    const deleteBtnStyle: React.CSSProperties = { padding: '4px 8px', fontSize: 11, background: '#7b1515', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 };

    if (phase === 'mode') {
      return (
        <GameWrapper title="Chess Pro">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 16px', maxWidth: 320, margin: '0 auto' }}>
            {savedGames.length > 0 && (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, borderBottom: '1px solid #444', paddingBottom: 4 }}>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 'bold', letterSpacing: 1 }}>SAVED DATA</div>
                  {savedGames.length > 2 && (
                    <button onClick={() => setShowAllSaves(v => !v)}
                      style={{ fontSize: 10, color: '#4fc3f7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {showAllSaves ? 'Show less ▲' : `Show all ▼`}
                    </button>
                  )}
                </div>

                {[
                  { title: 'UNFINISHED GAMES', items: savedGames.filter(s => !s.isAnalysis && !s.gameResult) },
                  { title: 'ANALYSIS SESSIONS', items: savedGames.filter(s => s.isAnalysis) },
                  { title: 'FINISHED GAMES', items: savedGames.filter(s => !s.isAnalysis && s.gameResult) }
                ].map(({ title, items }) => {
                  if (items.length === 0) return null;
                  const visible = showAllSaves ? items : items.slice(0, 2);
                  return (
                    <div key={title} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: '#aaa', fontWeight: 'bold', marginBottom: 6, opacity: 0.8 }}>{title} ({items.length})</div>
                      {visible.map(save => (
                        <div key={save.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <button style={saveBtnStyle} onClick={() => handleLoad(save)}>
                            <div style={{ fontSize: 12, color: '#eee', marginBottom: 1 }}>{save.isAnalysis ? '🔍 ' : ''}{save.label}</div>
                            <div style={{ fontSize: 10, color: '#888' }}>
                              {save.isAnalysis ? 'Analysis Session' : (save.setupMode === 'pvp' ? '👥 PvP' : `🤖 vs AI (${save.setupDifficulty})`)}
                              {save.gameResult ? ` · ${save.gameResult}` : (!save.isAnalysis ? ' · In progress' : '')}
                            </div>
                          </button>
                          <button style={deleteBtnStyle} onClick={() => setSavedGames(prev => deleteSaveFromStorage(prev, save.id))}>🗑</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#aaa', fontWeight: 'bold', letterSpacing: 1, alignSelf: 'flex-start' }}>NEW GAME</div>
            <button onClick={() => { setPendingSetup({ mode: 'pvp' }); setPhase('time'); }}
              style={{ padding: '12px 32px', fontSize: 15, background: '#3a6186', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', width: 240 }}>
              👥 Player vs Player
            </button>
            <button onClick={() => { setPendingSetup({ mode: 'ai' }); setPhase('color'); }}
              style={{ padding: '12px 32px', fontSize: 15, background: '#3a6186', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', width: 240 }}>
              🤖 vs Computer
            </button>
          </div>
        </GameWrapper>
      );
    }
    if (phase === 'color') {
      const colors: { id: Color; label: string }[] = [
        { id: 'w', label: '⬜ White (Move First)' },
        { id: 'b', label: '⬛ Black (Move Second)' },
      ];
      return (
        <GameWrapper title="Chess Pro">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 16px' }}>
            <div style={{ color: '#eee', fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>Your Color</div>
            {colors.map(({ id: col, label }) => (
              <button key={col} onClick={() => { setPendingSetup(p => ({ ...p, playerColor: col })); setPhase('difficulty'); }}
                style={{ padding: '12px 32px', fontSize: 15, background: '#3a6186', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', width: 240 }}>
                {label}
              </button>
            ))}
            <button onClick={() => setPhase('mode')} style={{ color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginTop: 4 }}>← Back</button>
          </div>
        </GameWrapper>
      );
    }
    if (phase === 'difficulty') {
      const diffs: { id: Difficulty; label: string }[] = [
        { id: 'easy', label: '🟢 Easy' },
        { id: 'medium', label: '🟡 Medium' },
        { id: 'hard', label: '🔴 Hard' },
      ];
      return (
        <GameWrapper title="Chess Pro">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 16px' }}>
            <div style={{ color: '#eee', fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>AI Difficulty</div>
            {diffs.map(({ id: diff, label }) => (
              <button key={diff} onClick={() => startNewGame({ mode: pendingSetup.mode as GameMode, playerColor: pendingSetup.playerColor as Color, difficulty: diff, timeControl: 'none', initialMinutes: 0, increment: 0 })}
                style={{ padding: '12px 32px', fontSize: 15, background: '#3a6186', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', width: 240 }}>
                {label}
              </button>
            ))}
            <button onClick={() => setPhase('color')} style={{ color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginTop: 4 }}>← Back</button>
          </div>
        </GameWrapper>
      );
    }
    if (phase === 'time') {
      const timeControls: { id: TimeControl; label: string; desc: string; mins: number; inc: number }[] = [
        { id: 'none', label: '⏱ No Timer', desc: 'Untimed game', mins: 0, inc: 0 },
        { id: '3+2', label: '⚡ 3+2 Blitz', desc: '3 min + 2s increment', mins: 3, inc: 2 },
        { id: '5+0', label: '🕐 5+0 Rapid', desc: '5 minutes each', mins: 5, inc: 0 },
        { id: '10+0', label: '🕐 10+0 Classic', desc: '10 minutes each', mins: 10, inc: 0 },
        { id: '15+10', label: '🐢 15+10 Long', desc: '15 min + 10s increment', mins: 15, inc: 10 },
      ];
      return (
        <GameWrapper title="Chess Pro">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '20px 16px' }}>
            <div style={{ color: '#eee', fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>Time Control</div>
            {timeControls.map(({ id: tc, label, desc, mins, inc }) => (
              <button key={tc} onClick={() => startNewGame({ mode: 'pvp', playerColor: 'w', difficulty: 'medium', timeControl: tc, initialMinutes: mins, increment: inc })}
                style={{ padding: '10px 20px', fontSize: 14, background: '#3a6186', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', width: 240, textAlign: 'left' }}>
                <div>{label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>{desc}</div>
              </button>
            ))}
            <button onClick={() => setPhase('mode')} style={{ color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginTop: 4 }}>← Back</button>
          </div>
        </GameWrapper>
      );
    }
  }

  // ── Game UI ────────────────────────────────────────────────────
  // Vertical eval bar (left of board on desktop, horizontal below board on mobile)
  const EvalBar = ({ vertical }: { vertical: boolean }) => {
    if (gameMode !== 'ai' && !analysis) return null;
    if (vertical) {
      // Use sigmoid-like mapping for smoother visual near 0
      const barWhitePct = evalNorm * 100;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 6, flexShrink: 0 }}>
          <div style={{
            width: 32, height: BOARD_PX, borderRadius: 5, overflow: 'hidden', border: '1px solid #444', position: 'relative',
            background: 'linear-gradient(to bottom, #1a1a1a 0%, #2a2a2a 50%, #e8e8e8 50%, #f5f5f5 100%)'
          }}>
            {/* Black region (top) */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: `${100 - barWhitePct}%`,
              background: '#1a1a1a', transition: 'height 0.4s ease'
            }} />
            {/* White region (bottom) */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: `${barWhitePct}%`,
              background: '#f0f0f0', transition: 'height 0.4s ease'
            }} />
            {/* Score label */}
            <div style={{
              position: 'absolute', left: 0, right: 0, zIndex: 2,
              top: `${Math.max(6, Math.min(BOARD_PX - 22, BOARD_PX * (1 - evalNorm) - 11))}px`,
              textAlign: 'center', fontSize: 13, fontWeight: 800, letterSpacing: -0.5,
              color: gs.evalScore >= 0 ? '#000' : '#fff', lineHeight: 1, pointerEvents: 'none',
              textShadow: gs.evalScore >= 0
                ? '0 0 6px rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.3)'
                : '0 0 6px rgba(0,0,0,0.9), 0 1px 2px rgba(255,255,255,0.3)',
              fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            }}>
              {evalLabel}
            </div>
          </div>
        </div>
      );
    }
    // Horizontal bar for mobile
    const barWhitePct = evalNorm * 100;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '4px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#888', minWidth: 20 }}>♚</span>
          <div style={{ flex: 1, height: 22, borderRadius: 4, overflow: 'hidden', border: '1px solid #444', position: 'relative', display: 'flex' }}>
            <div style={{ background: '#1a1a1a', width: `${100 - barWhitePct}%`, transition: 'width 0.4s ease' }} />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, letterSpacing: -0.5,
              color: gs.evalScore >= 0 ? '#000' : '#fff',
              textShadow: gs.evalScore >= 0
                ? '0 0 6px rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.3)'
                : '0 0 6px rgba(0,0,0,0.9), 0 1px 2px rgba(255,255,255,0.3)',
              pointerEvents: 'none',
              fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            }}>
              {evalLabel}
            </div>
            <div style={{ background: '#f0f0f0', width: `${barWhitePct}%`, transition: 'width 0.4s ease' }} />
          </div>
          <span style={{ fontSize: 11, color: '#ddd', minWidth: 20, textAlign: 'right' }}>♔</span>
        </div>
      </div>
    );
  };

  // Draw offer overlay
  const DrawOfferOverlay = () => {
    if (gs.drawOffer === 'none' || gs.gameResult) return null;
    // In PvP: show to opposing player. In AI: show to human player when AI offers
    const showToHuman = gameMode === 'pvp'
      ? gs.turn !== gs.drawOffer // show to the player whose turn it is (the opponent)
      : gs.drawOfferFrom === 'ai';
    if (!showToHuman) return null;
    const offerer = gs.drawOfferFrom === 'ai' ? 'AI' : (gs.drawOffer === 'w' ? 'White' : 'Black');
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 12, gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#ffd700' }}>🤝 Draw Offered</div>
        <div style={{ fontSize: 13, color: '#ccc' }}>{offerer} is offering a draw</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleAcceptDraw}
            style={{ padding: '8px 20px', fontSize: 14, background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
            ✓ Accept
          </button>
          <button onClick={handleDeclineDraw}
            style={{ padding: '8px 20px', fontSize: 14, background: '#c62828', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
            ✗ Decline
          </button>
        </div>
      </div>
    );
  };

  // Resign confirmation overlay
  const ResignConfirmOverlay = () => {
    if (!gs.resignConfirm || gs.gameResult) return null;
    return (
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 12, gap: 8 }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#ff6b6b' }}>🏳️ Resign?</div>
        <div style={{ fontSize: 13, color: '#ccc' }}>Are you sure you want to resign?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={(event) => {
              event.stopPropagation();
              handleResign();
            }}
            style={{ padding: '8px 20px', fontSize: 14, background: '#c62828', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
            Yes, Resign
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              setGs(prev => ({ ...prev, resignConfirm: false }));
            }}
            style={{ padding: '8px 20px', fontSize: 14, background: '#555', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  };

  // Promotion piece buttons
  const promoIsWhite = gs.promotionPending
    ? gs.board[gs.promotionPending.from[0]][gs.promotionPending.from[1]]?.color === 'w'
    : true;
  const promoSQ = Math.min(SQ, 56);

  const fmtTime = (ms: number) => {
    if (ms <= 0) return '0:00';
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const analysisNavBar = analysis ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1b2a', borderRadius: 6, padding: '4px 8px', width: isMobile ? BOARD_PX : undefined }}>
      <span style={{ fontSize: 11, color: '#4fc3f7', flexShrink: 0 }}>
        {analysis.isComputing ? '⏳ Analyzing...' : '🔍 Analysis'}
      </span>
      <button onClick={() => setAnalysis(prev => prev ? { ...prev, currentIdx: Math.max(0, prev.currentIdx - 1) } : null)}
        style={{ padding: '3px 8px', fontSize: 14, background: '#1a2a3a', color: '#ccc', border: '1px solid #334', borderRadius: 4, cursor: 'pointer' }}>◀</button>
      <span style={{ fontSize: 11, color: '#aaa', minWidth: 50, textAlign: 'center' }}>
        {analysis.currentIdx}/{analysis.entries.length - 1}
      </span>
      <button onClick={() => setAnalysis(prev => prev ? { ...prev, currentIdx: Math.min(prev.entries.length - 1, prev.currentIdx + 1) } : null)}
        style={{ padding: '3px 8px', fontSize: 14, background: '#1a2a3a', color: '#ccc', border: '1px solid #334', borderRadius: 4, cursor: 'pointer' }}>▶</button>
      <button onClick={() => setAnalysis(null)}
        style={{ padding: '3px 8px', fontSize: 12, background: '#7b1515', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
    </div>
  ) : null;

  const analysisExplanation = analysis ? (() => {
    const entry = analysis.entries[analysis.currentIdx];
    if (!entry) return null;
    const bestMoveLabel = entry.bestMove
      ? `${normalizeStyleSquare(entry.bestMove[0], entry.bestMove[1], entry.turn)} -> ${normalizeStyleSquare(entry.bestMove[2], entry.bestMove[3], entry.turn)}`
      : null;
    const classificationText: Record<MoveClassification, string> = {
      brilliant: 'This move matched the engine very closely and preserved a high-quality plan.',
      great: 'This was one of the best practical moves in the position.',
      good: 'This was solid, but the engine saw a slightly stronger continuation.',
      inaccuracy: 'This move gave up a small edge or made the position less efficient.',
      mistake: 'This move noticeably worsened the position and gave the opponent better chances.',
      blunder: 'This move dropped major value or allowed a strong tactical punishment.',
    };
    const explanation = entry.classification
      ? classificationText[entry.classification]
      : analysis.currentIdx === 0
        ? 'This is the starting position. Step through the moves to see engine feedback.'
        : 'This position is still being evaluated.';
    const evalText = entry.evalScore === null
      ? 'Engine score pending.'
      : `Engine eval: ${entry.evalScore > 0 ? '+' : ''}${entry.evalScore.toFixed(2)}.`;

    return (
      <div style={{ background: '#111827', border: '1px solid #243042', borderRadius: 6, padding: '6px 8px', marginTop: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 'bold', color: '#dbeafe' }}>
          {entry.classification ? `${entry.classification[0].toUpperCase()}${entry.classification.slice(1)}` : 'Analysis note'}
        </div>
        <div style={{ fontSize: 10, color: '#9fb3c8', lineHeight: 1.35, marginTop: 2 }}>
          {explanation} {evalText} {bestMoveLabel ? `Engine preference: ${bestMoveLabel}.` : ''}
        </div>
      </div>
    );
  })() : null;

  // Analysis move table for sidebar/mobile
  const analysisMoveTable = analysis ? (
    <div style={{ background: '#1a1a2e', borderRadius: 6, padding: '4px 6px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ fontSize: 9, color: '#aaa', marginBottom: 2, fontWeight: 'bold' }}>ANALYSIS</div>
      <div style={{ height: isMobile ? 52 : 200, overflowY: 'auto', fontSize: 10, fontFamily: 'monospace' }}>
        {Array.from({ length: Math.ceil(gs.history.length / 2) }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 4 }}>
            <span style={{ color: '#555', minWidth: isMobile ? 20 : 24 }}>{i + 1}.</span>
            {[i * 2, i * 2 + 1].map(mi => {
              if (!gs.history[mi]) return null;
              const entryIdx = mi + 1;
              const e = analysis.entries[entryIdx];
              const cl = e?.classification;
              return (
                <span key={mi}
                  onClick={() => setAnalysis(prev => prev ? { ...prev, currentIdx: entryIdx } : null)}
                  style={{
                    cursor: 'pointer', color: analysis.currentIdx === entryIdx ? '#4fc3f7' : (mi % 2 === 0 ? '#fff' : '#aaa'), minWidth: isMobile ? 40 : 46,
                    background: analysis.currentIdx === entryIdx ? 'rgba(79,195,247,0.15)' : 'transparent', borderRadius: 2, padding: '0 1px'
                  }}>
                  {gs.history[mi]}{cl ? <span style={{ color: BADGE_COLORS[cl], fontSize: 9 }}>{BADGE_SYMBOLS[cl]}</span> : ''}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const desktopAnalysisPanel = analysis ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
      {analysisExplanation}
      {analysisMoveTable}
    </div>
  ) : null;

  return (
    <GameWrapper title="Chess Pro" onRestart={() => { setSetup(null); setPhase('mode'); setGs(initChessState()); setAnalysis(null); }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isMobile ? '2px' : '4px', gap: 0, position: 'relative' }}>

        {/* Toast notifications */}
        {saveToast && (
          <div style={{
            position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
            background: 'rgba(20,20,30,0.95)', color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)', pointerEvents: 'none'
          }}>
            {saveToast}
          </div>
        )}

        {/* ── DESKTOP layout: eval bar left, board center, sidebar right ── */}
        {!isMobile ? (
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
            <EvalBar vertical={true} />

            <div>
              {/* Black captured */}
              <div style={{ minHeight: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, marginBottom: 2, fontSize: 13, color: '#ccc' }}>
                {capOrder.map(p => displayCapW[p] ? <span key={p} style={{ opacity: 0.9 }}>{pieceSymbols[p]}{displayCapW[p]! > 1 ? <sup style={{ fontSize: 9 }}>{displayCapW[p]}</sup> : ''}</span> : null)}
                {matDiff < 0 && <span style={{ marginLeft: 6, fontSize: 13, color: '#fff', fontWeight: 'bold' }}>+{Math.abs(matDiff)}</span>}
              </div>

              {/* Board canvas */}
              <div style={{ position: 'relative' }}>
                <canvas ref={canvasRef} width={BOARD_PX} height={BOARD_PX}
                  style={{ display: 'block', userSelect: 'none', touchAction: 'none', borderRadius: 2, border: '2px solid #555', cursor: gs.gameResult ? 'default' : 'pointer' }}
                  onClick={handleClick} onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
                  onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
                  onContextMenu={(e) => e.preventDefault()} />
                {gs.promotionPending && !analysis && <PromotionOverlay isWhite={promoIsWhite} sq={promoSQ} onPick={handlePromotion} />}
                {gs.gameResult && !analysis && <GameOverOverlay result={gs.gameResult}
                  onPlayAgain={() => startNewGame(setup!)}
                  onMenu={() => { setSetup(null); setPhase('mode'); setGs(initChessState()); setAnalysis(null); }}
                  onAnalyze={startAnalysis}
                  onSave={handleSave} />}
                <DrawOfferOverlay />
                <ResignConfirmOverlay />
              </div>

              {/* Analysis nav bar below board */}
              {analysis && <div style={{ marginTop: 4 }}>{analysisNavBar}</div>}

              {/* White captured */}
              <div style={{ minHeight: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, marginTop: analysis ? 2 : 2, fontSize: 13, color: '#ccc' }}>
                {capOrder.map(p => displayCapB[p] ? <span key={p} style={{ opacity: 0.9 }}>{pieceSymbols[p]}{displayCapB[p]! > 1 ? <sup style={{ fontSize: 9 }}>{displayCapB[p]}</sup> : ''}</span> : null)}
                {matDiff > 0 && <span style={{ marginLeft: 6, fontSize: 13, color: '#fff', fontWeight: 'bold' }}>+{matDiff}</span>}
              </div>
            </div>

            {/* Desktop sidebar */}
            <div style={{ width: 148, marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 6, height: BOARD_PX + 44 }}>
              <TurnBox turn={anaEntry ? anaEntry.turn : gs.turn} inCheck={!analysis && isInCheck(gs.board, gs.turn)} gameResult={analysis ? null : gs.gameResult} />
              {pvpTimers && !analysis && (
                <div style={{ display: 'flex', justifyContent: 'space-between', background: '#1a1a2e', borderRadius: 6, padding: '4px 8px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#aaa' }}>BLACK</div>
                    <div style={{ fontSize: 16, fontWeight: 'bold', color: gs.turn === 'b' ? '#fff' : '#666', fontFamily: 'monospace' }}>{fmtTime(pvpTimers.b)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#aaa' }}>WHITE</div>
                    <div style={{ fontSize: 16, fontWeight: 'bold', color: gs.turn === 'w' ? '#fff' : '#666', fontFamily: 'monospace' }}>{fmtTime(pvpTimers.w)}</div>
                  </div>
                </div>
              )}
              {analysis ? desktopAnalysisPanel : <MoveHistory history={gs.history} maxH={220} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                <button onClick={handleUndo}
                  style={{ padding: '5px 8px', fontSize: 11, background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}>
                  ↩ Undo (Ctrl+Z)
                </button>
                <button onClick={toggleAI}
                  style={{ padding: '5px 8px', fontSize: 11, background: demoMode === 'adaptive' ? '#7b1fa2' : aiDemoMode ? '#0288d1' : '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  {demoLabel}
                </button>
                {gameMode === 'ai' && (
                  <button onClick={handleHint}
                    style={{ padding: '5px 8px', fontSize: 11, background: '#1a5276', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    💡 Hint
                  </button>
                )}
                <button onClick={handleSave}
                  style={{ padding: '5px 8px', fontSize: 11, background: '#1e4d2b', color: '#ccc', border: '1px solid #2e7d32', borderRadius: 4, cursor: 'pointer' }}>
                  💾 Save
                </button>
                {!gs.gameResult && !analysis && (
                  <>
                    <button onClick={handleOfferDraw}
                      style={{ padding: '5px 8px', fontSize: 11, background: '#5d4037', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      🤝 Draw
                    </button>
                    <button onClick={() => setGs(prev => ({ ...prev, resignConfirm: true }))}
                      style={{ padding: '5px 8px', fontSize: 11, background: '#7b1515', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      🏳️ Resign
                    </button>
                  </>
                )}
                <div style={{ fontSize: 9, color: '#555', textAlign: 'center', lineHeight: 1.3 }}>
                  {gameMode === 'ai' ? `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} · You play ${playerColor === 'w' ? 'White' : 'Black'}` : 'PvP Mode'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── MOBILE layout: board full-width, everything below ── */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 4 }}>
            {/* Top row: black captured + turn indicator */}
            <div style={{ display: 'flex', width: BOARD_PX, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#ccc' }}>
                {capOrder.map(p => displayCapW[p] ? <span key={p} style={{ opacity: 0.8 }}>{pieceSymbols[p]}{displayCapW[p]! > 1 ? <sup style={{ fontSize: 7 }}>{displayCapW[p]}</sup> : ''}</span> : null)}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 'bold', color: gs.turn === 'w' ? '#fff' : '#bbb', padding: '2px 6px', borderRadius: 4,
                background: !analysis && isInCheck(gs.board, gs.turn) && !gs.gameResult ? '#c62828' : '#1a1a2e'
              }}>
                {gs.gameResult ? '—' : (anaEntry ? anaEntry.turn : gs.turn) === 'w' ? '⬜ White' : '⬛ Black'}
                {!analysis && isInCheck(gs.board, gs.turn) && !gs.gameResult ? ' ⚠️' : ''}
              </div>
            </div>
            {pvpTimers && !analysis && (
              <div style={{ display: 'flex', width: BOARD_PX, justifyContent: 'space-between' }}>
                <div style={{
                  fontSize: 13, fontWeight: 'bold', fontFamily: 'monospace', color: gs.turn === 'b' ? '#fff' : '#666',
                  background: '#1a1a2e', padding: '2px 8px', borderRadius: 4
                }}>
                  ⬛ {fmtTime(pvpTimers.b)}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 'bold', fontFamily: 'monospace', color: gs.turn === 'w' ? '#fff' : '#666',
                  background: '#1a1a2e', padding: '2px 8px', borderRadius: 4
                }}>
                  ⬜ {fmtTime(pvpTimers.w)}
                </div>
              </div>
            )}

            {/* Board canvas */}
            <div style={{ position: 'relative' }}>
              <canvas ref={canvasRef} width={BOARD_PX} height={BOARD_PX}
                style={{ display: 'block', userSelect: 'none', touchAction: 'none', borderRadius: 2, border: '2px solid #555', cursor: gs.gameResult ? 'default' : 'pointer' }}
                onClick={handleClick} onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
                onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
                onContextMenu={(e) => e.preventDefault()} />
              {gs.promotionPending && !analysis && <PromotionOverlay isWhite={promoIsWhite} sq={promoSQ} onPick={handlePromotion} />}
              {gs.gameResult && !analysis && <GameOverOverlay result={gs.gameResult}
                onPlayAgain={() => startNewGame(setup!)}
                onMenu={() => { setSetup(null); setPhase('mode'); setGs(initChessState()); setAnalysis(null); }}
                onAnalyze={startAnalysis}
                onSave={handleSave} />}
              <DrawOfferOverlay />
              <ResignConfirmOverlay />
            </div>

            {/* Analysis nav bar */}
            {analysis && <div style={{ width: BOARD_PX }}>{analysisNavBar}{analysisExplanation}</div>}

            {/* White captured */}
            <div style={{ display: 'flex', width: BOARD_PX, alignItems: 'center', gap: 2, fontSize: 11, color: '#ccc' }}>
              {capOrder.map(p => displayCapB[p] ? <span key={p} style={{ opacity: 0.8 }}>{pieceSymbols[p]}{displayCapB[p]! > 1 ? <sup style={{ fontSize: 7 }}>{displayCapB[p]}</sup> : ''}</span> : null)}
            </div>

            {/* Horizontal eval bar */}
            {(gameMode === 'ai' || analysis) && (
              <div style={{ width: BOARD_PX }}>
                <EvalBar vertical={false} />
              </div>
            )}

            {/* Bottom controls row */}
            <div style={{ width: BOARD_PX, display: 'flex', gap: 4 }}>
              <button onClick={handleUndo}
                style={{ flex: 1, padding: '7px 2px', fontSize: 11, background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: 6, cursor: 'pointer' }}>
                ↩ Undo
              </button>
              <button onClick={toggleAI}
                style={{ flex: 1, padding: '7px 2px', fontSize: 11, background: demoMode === 'adaptive' ? '#7b1fa2' : aiDemoMode ? '#0288d1' : '#333', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                {demoMode === 'adaptive' ? '🧠 Learn Me' : aiDemoMode ? '🤖 Classic AI' : '🎮 Demo Off'}
              </button>
              {!gs.gameResult && !analysis && (
                <>
                  <button onClick={handleOfferDraw}
                    style={{ flex: 1, padding: '7px 2px', fontSize: 11, background: '#5d4037', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    🤝
                  </button>
                  <button onClick={() => setGs(prev => ({ ...prev, resignConfirm: true }))}
                    style={{ flex: 1, padding: '7px 2px', fontSize: 11, background: '#7b1515', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    🏳️
                  </button>
                </>
              )}
              <button onClick={handleSave}
                style={{ flex: 1, padding: '7px 2px', fontSize: 11, background: '#1e4d2b', color: '#ccc', border: '1px solid #2e7d32', borderRadius: 6, cursor: 'pointer' }}>
                💾
              </button>
              <button onClick={() => { setSetup(null); setPhase('mode'); setGs(initChessState()); setAnalysis(null); }}
                style={{ flex: 1, padding: '7px 2px', fontSize: 11, background: '#444', color: '#ccc', border: '1px solid #555', borderRadius: 6, cursor: 'pointer' }}>
                ☰ Menu
              </button>
            </div>

            {/* Scrollable move history or analysis table */}
            {analysis ? (
              <div style={{ width: BOARD_PX }}>
                {analysisMoveTable}
              </div>
            ) : (
              <div style={{ width: BOARD_PX, background: '#1a1a2e', borderRadius: 6, padding: '4px 6px' }}>
                <div style={{ fontSize: 9, color: '#aaa', marginBottom: 2, fontWeight: 'bold' }}>MOVES</div>
                <div style={{ height: 52, overflowY: 'auto', fontSize: 10, fontFamily: 'monospace' }}
                  ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
                  {Array.from({ length: Math.ceil(gs.history.length / 2) }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', gap: 4 }}>
                      <span style={{ color: '#555', minWidth: 20 }}>{i + 1}.</span>
                      <span style={{ color: '#fff', minWidth: 42 }}>{gs.history[i * 2]}</span>
                      {gs.history[i * 2 + 1] && <span style={{ color: '#aaa' }}>{gs.history[i * 2 + 1]}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mode info */}
            <div style={{ fontSize: 9, color: '#555', textAlign: 'center' }}>
              {gameMode === 'ai' ? `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} · You play ${playerColor === 'w' ? 'White' : 'Black'}` : 'PvP Mode'}
            </div>
          </div>
        )}
      </div>
    </GameWrapper>
  );
}
