import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';

type Grid = (number | 0)[][];
type Notes = Set<number>[][]; // [row][col] = Set of pencil marks

interface Difficulty {
  label: string;
  clues: number; // min clues to leave
}

const DIFFICULTIES: Difficulty[] = [
  { label: 'Easy', clues: 40 },
  { label: 'Medium', clues: 32 },
  { label: 'Hard', clues: 26 },
  { label: 'Expert', clues: 22 },
];

// Backtracking sudoku solver
function solve(grid: Grid): Grid | null {
  const g = grid.map(r => [...r]) as Grid;
  function possible(r: number, c: number, n: number): boolean {
    for (let i = 0; i < 9; i++) {
      if (g[r][i] === n || g[i][c] === n) return false;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
      if (g[br + dr][bc + dc] === n) return false;
    }
    return true;
  }
  function bt(): boolean {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (g[r][c] !== 0) continue;
      const nums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
      for (const n of nums) {
        if (possible(r, c, n)) {
          g[r][c] = n;
          if (bt()) return true;
          g[r][c] = 0;
        }
      }
      return false;
    }
    return true;
  }
  return bt() ? g : null;
}

function generatePuzzle(clues: number): { puzzle: Grid; solution: Grid } {
  const empty: Grid = Array.from({ length: 9 }, () => Array(9).fill(0));
  const solution = solve(empty)!;
  const puzzle = solution.map(r => [...r]) as Grid;

  // Remove cells randomly until we have `clues` cells left
  const positions = Array.from({ length: 81 }, (_, i) => i).sort(() => Math.random() - 0.5);
  let removed = 0;
  const target = 81 - clues;

  for (const pos of positions) {
    if (removed >= target) break;
    const r = Math.floor(pos / 9), c = pos % 9;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;

    // Count solutions (stop at 2 to verify uniqueness)
    const copy = puzzle.map(row => [...row]) as Grid;
    let count = 0;
    function countSols(g: Grid): void {
      if (count > 1) return;
      let found = false;
      outer: for (let rr = 0; rr < 9; rr++) for (let cc = 0; cc < 9; cc++) {
        if (g[rr][cc] !== 0) continue;
        found = true;
        for (let n = 1; n <= 9; n++) {
          if (canPlace(g, rr, cc, n)) {
            g[rr][cc] = n;
            countSols(g);
            g[rr][cc] = 0;
          }
        }
        break outer;
      }
      if (!found) count++;
    }
    countSols(copy);

    if (count === 1) {
      removed++;
    } else {
      puzzle[r][c] = backup; // restore
    }
  }

  return { puzzle, solution };
}

function canPlace(g: Grid, r: number, c: number, n: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (g[r][i] === n || g[i][c] === n) return false;
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
    if (g[br + dr][bc + dc] === n) return false;
  }
  return true;
}

function makeNotes(): Notes {
  return Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set<number>())
  );
}

function isComplete(grid: Grid): boolean {
  return grid.every(row => row.every(c => c !== 0));
}

function hasConflict(grid: Grid, r: number, c: number): boolean {
  const val = grid[r][c];
  if (!val) return false;
  for (let i = 0; i < 9; i++) {
    if (i !== c && grid[r][i] === val) return true;
    if (i !== r && grid[i][c] === val) return true;
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
    if (br + dr !== r && bc + dc !== c && grid[br + dr][bc + dc] === val) return true;
  }
  return false;
}

// Constraint propagation AI solver step
function aiSolveStep(grid: Grid, solution: Grid): { r: number; c: number; val: number } | null {
  // Naked singles: cells with only one possible value
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c] !== 0) continue;
    const possible = [];
    for (let n = 1; n <= 9; n++) {
      if (canPlace(grid, r, c, n)) possible.push(n);
    }
    if (possible.length === 1) return { r, c, val: possible[0] };
  }

  // Hidden singles: number that can only go in one cell in row/col/box
  for (let unit = 0; unit < 9; unit++) {
    for (let n = 1; n <= 9; n++) {
      // Row
      const rowCells = [];
      for (let c = 0; c < 9; c++) if (grid[unit][c] === 0 && canPlace(grid, unit, c, n)) rowCells.push([unit, c]);
      if (rowCells.length === 1) return { r: rowCells[0][0], c: rowCells[0][1], val: n };
      // Col
      const colCells = [];
      for (let r = 0; r < 9; r++) if (grid[r][unit] === 0 && canPlace(grid, r, unit, n)) colCells.push([r, unit]);
      if (colCells.length === 1) return { r: colCells[0][0], c: colCells[0][1], val: n };
      // Box
      const br = Math.floor(unit / 3) * 3, bc = (unit % 3) * 3;
      const boxCells = [];
      for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
        const r = br + dr, c = bc + dc;
        if (grid[r][c] === 0 && canPlace(grid, r, c, n)) boxCells.push([r, c]);
      }
      if (boxCells.length === 1) return { r: boxCells[0][0], c: boxCells[0][1], val: n };
    }
  }

  // Fallback: use solution
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c] === 0) return { r, c, val: solution[r][c] };
  }
  return null;
}

function getAdaptiveSudokuStep(
  grid: Grid,
  solution: Grid,
  getActionWeight: (action: string) => number
): { r: number; c: number; val: number } | null {
  const logical = aiSolveStep(grid, solution);
  if (logical) return logical;

  const candidates: { r: number; c: number; val: number; rank: number }[] = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c] !== 0) continue;
    const val = solution[r][c];
    const rowBand = Math.floor(r / 3);
    const colBand = Math.floor(c / 3);
    const rank =
      getActionWeight(`value:${val}`) +
      getActionWeight(`rowband:${rowBand}`) * 0.6 +
      getActionWeight(`colband:${colBand}`) * 0.6;
    candidates.push({ r, c, val, rank });
  }
  return candidates.sort((a, b) => b.rank - a.rank)[0] ?? null;
}

interface GS {
  puzzle: Grid;
  grid: Grid;
  solution: Grid;
  given: boolean[][];
  notes: Notes;
  selected: [number, number] | null;
  pencilMode: boolean;
  mistakes: number;
  won: boolean;
  startTime: number;
  elapsed: number;
  aiDisabled: boolean;
  hints: number;
}

export function SudokuGame() {
  const { recordGame, bestScore } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, mode: demoMode, cycleMode, getAdaptiveDelay, getActionWeight, recordPlayerAction } = useAIDemo('sudoku');
  const aiDemoRef = useRef(aiDemoMode);

  const [diffIdx, setDiffIdx] = useState(0);
  const [configured, setConfigured] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    aiDemoRef.current = aiDemoMode;
  }, [aiDemoMode]);

  const initGs = useCallback((dIdx: number): GS => {
    const { puzzle, solution } = generatePuzzle(DIFFICULTIES[dIdx].clues);
    return {
      puzzle, grid: puzzle.map(r => [...r]) as Grid, solution,
      given: puzzle.map(r => r.map(c => c !== 0)),
      notes: makeNotes(),
      selected: null, pencilMode: false, mistakes: 0,
      won: false, startTime: Date.now(), elapsed: 0, aiDisabled: false, hints: 3,
    };
  }, []);

  const [gs, setGs] = useState<GS>(() => initGs(0));

  const startGame = useCallback((dIdx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    setDiffIdx(dIdx);
    setConfigured(true);
    startTimeRef.current = Date.now();
    setGs(initGs(dIdx));
    timerRef.current = setInterval(() => {
      setGs(g => g.won ? g : { ...g, elapsed: Math.floor((Date.now() - g.startTime) / 1000) });
    }, 500);
  }, [initGs]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
  }, []);

  const enterValue = useCallback((val: number) => {
    setGs(prev => {
      if (!prev.selected || prev.won) return prev;
      const [r, c] = prev.selected;
      if (prev.given[r][c]) return prev;
      if (prev.pencilMode) {
        recordPlayerAction(val === 0 ? 'note:clear' : `note:${val}`, { precision: 0.72, exploration: 0.58 });
      } else {
        recordPlayerAction(val === 0 ? 'erase' : `value:${val}`, {
          precision: val === prev.solution[r][c] ? 0.82 : 0.38,
          risk: val === 0 ? 0.2 : 0.46,
        });
        recordPlayerAction(`rowband:${Math.floor(r / 3)}`, { exploration: 0.5 });
        recordPlayerAction(`colband:${Math.floor(c / 3)}`, { exploration: 0.5 });
      }

      if (prev.pencilMode) {
        const newNotes = prev.notes.map(row => row.map(cell => new Set(cell)));
        if (val === 0) { newNotes[r][c].clear(); }
        else if (newNotes[r][c].has(val)) { newNotes[r][c].delete(val); }
        else { newNotes[r][c].add(val); }
        return { ...prev, notes: newNotes };
      }

      const newGrid = prev.grid.map(row => [...row]) as Grid;
      newGrid[r][c] = val;
      const newNotes = prev.notes.map(row2 => row2.map(cell => new Set(cell)));
      if (val !== 0) newNotes[r][c].clear();

      let mistakes = prev.mistakes;
      if (val !== 0 && val !== prev.solution[r][c]) mistakes++;

      const won = isComplete(newGrid) && newGrid.every((row, rr) => row.every((v, cc) => v === prev.solution[rr][cc]));
      if (won) {
        const dur = (Date.now() - prev.startTime) / 1000;
        const score = Math.max(0, 1000 - mistakes * 50 - Math.floor(dur));
        recordGame('sudoku', true, score, dur, { won: true, mistakes, difficulty: DIFFICULTIES[diffIdx].label, time: dur });
        if (timerRef.current) clearInterval(timerRef.current);
      }
      return { ...prev, grid: newGrid, notes: newNotes, mistakes, won };
    });
  }, [diffIdx, recordGame, recordPlayerAction]);

  const hint = useCallback(() => {
    setGs(prev => {
      if (prev.hints <= 0 || prev.won) return prev;
      recordPlayerAction('hint', { precision: 0.36, risk: 0.18 });
      const step = aiSolveStep(prev.grid, prev.solution);
      if (!step) return prev;
      const newGrid = prev.grid.map(r => [...r]) as Grid;
      newGrid[step.r][step.c] = step.val;
      const newNotes = prev.notes.map(row => row.map(cell => new Set(cell)));
      newNotes[step.r][step.c].clear();
      const won = isComplete(newGrid);
      if (won) {
        const dur = (Date.now() - prev.startTime) / 1000;
        recordGame('sudoku', true, Math.max(0, 500 - prev.mistakes * 50), dur);
      }
      return { ...prev, grid: newGrid, notes: newNotes, hints: prev.hints - 1, selected: [step.r, step.c], won };
    });
  }, [recordGame, recordPlayerAction]);

  // AI Demo
  useEffect(() => {
    if (!aiDemoMode || !configured || gs.won || gs.aiDisabled) return;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      setGs(prev => {
        if (!prev || prev.won || prev.aiDisabled) return prev;
        const step = isAdaptive ? getAdaptiveSudokuStep(prev.grid, prev.solution, getActionWeight) : aiSolveStep(prev.grid, prev.solution);
        if (!step) return prev;
        const newGrid = prev.grid.map(r => [...r]) as Grid;
        newGrid[step.r][step.c] = step.val;
        const newNotes = prev.notes.map(row => row.map(cell => new Set(cell)));
        newNotes[step.r][step.c].clear();
        const won = isComplete(newGrid);
        if (won) {
          const dur = (Date.now() - prev.startTime) / 1000;
          recordGame('sudoku', true, Math.max(0, 1000 - prev.mistakes * 50 - Math.floor(dur)), dur);
        }
        return { ...prev, grid: newGrid, notes: newNotes, selected: [step.r, step.c], won };
      });
    }, getAdaptiveDelay(400));
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [aiDemoMode, configured, getActionWeight, getAdaptiveDelay, gs.aiDisabled, gs.grid, gs.won, isAdaptive, recordGame]);

  useEffect(() => {
    if (!aiDemoMode) return;
    const id = window.setTimeout(() => {
      setGs(g => ({ ...g, aiDisabled: false }));
    }, 0);
    return () => window.clearTimeout(id);
  }, [aiDemoMode]);

  useEffect(() => {
    const stopAI = () => { if (aiDemoRef.current) setGs(g => ({ ...g, aiDisabled: true })); };
    window.addEventListener('keydown', stopAI, true);
    return () => window.removeEventListener('keydown', stopAI, true);
  }, [recordPlayerAction]);

  // Keyboard input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') enterValue(parseInt(e.key));
      if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') enterValue(0);
      if (e.key === 'p' || e.key === 'P') {
        recordPlayerAction('mode:pencil', { precision: 0.62, exploration: 0.58 });
        setGs(g => ({ ...g, pencilMode: !g.pencilMode }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enterValue, recordPlayerAction]);

  const best = bestScore('sudoku');
  const mm = Math.floor(gs.elapsed / 60), ss = gs.elapsed % 60;
  const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;
  const sudokuDemoLabel = demoMode === 'adaptive' ? '🧠 Learn Me' : aiDemoMode ? '🤖 Classic AI' : '🎮 Demo Off';

  if (!configured) {
    return (
      <GameWrapper title="Sudoku">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
          <div style={{ color: '#fff', fontSize: 18 }}>Select Difficulty</div>
          {DIFFICULTIES.map((d, i) => (
            <button key={i} onClick={() => startGame(i)}
              style={{ padding: '10px 32px', fontSize: 16, background: diffIdx === i ? '#3498db' : '#333', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', width: 200 }}>
              {d.label} ({d.clues} clues)
            </button>
          ))}
          {best > 0 && <div style={{ color: '#aaa', fontSize: 13, marginTop: 8 }}>Best: {best}</div>}
        </div>
      </GameWrapper>
    );
  }

  const CELL = 44;
  const conflictSet = new Set<string>();
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (hasConflict(gs.grid, r, c)) conflictSet.add(`${r},${c}`);
  }

  const sel = gs.selected;
  const selVal = sel ? gs.grid[sel[0]][sel[1]] : 0;

  return (
    <GameWrapper title="Sudoku" score={Math.max(0, 1000 - gs.mistakes * 50 - gs.elapsed)} onRestart={() => startGame(diffIdx)}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 8 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 4, alignItems: 'center' }}>
          <div style={{ background: '#1a1a2e', padding: '4px 10px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#aaa' }}>TIME</div>
            <div style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>{timeStr}</div>
          </div>
          <div style={{ background: '#1a1a2e', padding: '4px 10px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#aaa' }}>MISTAKES</div>
            <div style={{ fontSize: 16, color: gs.mistakes > 0 ? '#f66' : '#fff', fontWeight: 'bold' }}>{gs.mistakes}</div>
          </div>
          <button onClick={() => { recordPlayerAction('mode:pencil', { precision: 0.62, exploration: 0.58 }); setGs(g => ({ ...g, pencilMode: !g.pencilMode })); }}
            style={{ padding: '4px 10px', background: gs.pencilMode ? '#3498db' : '#555', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            {gs.pencilMode ? 'Notes ON' : 'Notes OFF'}
          </button>
          <button onClick={hint} disabled={gs.hints <= 0 || gs.won}
            style={{ padding: '4px 10px', background: '#e67e22', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            Hint ({gs.hints})
          </button>
          <button onClick={() => { setGs(g => ({ ...g, aiDisabled: false })); cycleMode(); }}
            style={{ padding: '4px 10px', background: demoMode === 'adaptive' ? '#7b1fa2' : aiDemoMode ? '#0288d1' : '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            {sudokuDemoLabel}
          </button>
        </div>

        {/* Grid */}
        <div style={{ border: '2px solid #aaa', display: 'inline-grid', gridTemplateColumns: `repeat(9, ${CELL}px)` }}>
          {gs.grid.map((row, r) => row.map((val, c) => {
            const isSelected = sel?.[0] === r && sel?.[1] === c;
            const isRelated = sel ? (sel[0] === r || sel[1] === c || (Math.floor(sel[0] / 3) === Math.floor(r / 3) && Math.floor(sel[1] / 3) === Math.floor(c / 3))) : false;
            const isSameVal = sel && selVal && val === selVal;
            const isGiven = gs.given[r][c];
            const isConflict = conflictSet.has(`${r},${c}`);
            const isHinted = sel?.[0] === r && sel?.[1] === c && !isGiven;
            void isHinted;
            const notes = gs.notes[r][c];

            const borderR = c % 3 === 2 && c < 8 ? '2px solid #aaa' : '1px solid #444';
            const borderB = r % 3 === 2 && r < 8 ? '2px solid #aaa' : '1px solid #444';

            let bg = '#1a1a2e';
            if (isSelected) bg = '#1565c0';
            else if (isSameVal && selVal) bg = '#0d3b7a';
            else if (isRelated) bg = '#12122a';

            return (
              <div key={`${r},${c}`}
                onClick={() => { recordPlayerAction(`rowband:${Math.floor(r / 3)}`, { exploration: 0.52 }); recordPlayerAction(`colband:${Math.floor(c / 3)}`, { exploration: 0.52 }); setGs(g => ({ ...g, selected: [r, c] })); }}
                style={{
                  width: CELL, height: CELL,
                  background: bg,
                  borderRight: borderR,
                  borderBottom: borderB,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  boxSizing: 'border-box',
                }}>
                {val !== 0 ? (
                  <span style={{ fontSize: 22, fontWeight: isGiven ? 'bold' : 'normal', color: isConflict ? '#f55' : isGiven ? '#fff' : '#6af', userSelect: 'none' }}>{val}</span>
                ) : notes.size > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: CELL - 4, height: CELL - 4 }}>
                    {[1,2,3,4,5,6,7,8,9].map(n => (
                      <span key={n} style={{ fontSize: 9, color: '#888', textAlign: 'center', lineHeight: `${(CELL-4)/3}px` }}>
                        {notes.has(n) ? n : ''}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }))}
        </div>

        {/* Number pad — gray out numbers that are fully placed (9 times) */}
        {(() => {
          const numCount: Record<number, number> = {};
          for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
            const v = gs.grid[r][c];
            if (v) numCount[v] = (numCount[v] || 0) + 1;
          }
          return (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {[1,2,3,4,5,6,7,8,9].map(n => {
                const full = (numCount[n] || 0) >= 9;
                return (
                  <button key={n} onClick={() => !full && enterValue(n)}
                    style={{
                      width: 36, height: 36, fontSize: 18,
                      background: full ? '#222' : '#333',
                      color: full ? '#555' : '#fff',
                      border: `1px solid ${full ? '#444' : '#555'}`,
                      borderRadius: 4,
                      cursor: full ? 'default' : 'pointer',
                      fontWeight: 'bold',
                      opacity: full ? 0.4 : 1,
                    }}>
                    {n}
                  </button>
                );
              })}
              <button onClick={() => enterValue(0)}
                style={{ width: 36, height: 36, fontSize: 14, background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          );
        })()}

        <button onClick={() => setConfigured(false)}
          style={{ marginTop: 4, padding: '4px 12px', background: '#333', color: '#aaa', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
          Change Difficulty
        </button>

        {gs.won && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ fontSize: 36, fontWeight: 'bold', color: '#4caf50' }}>Solved!</div>
            <div style={{ color: '#eee', marginBottom: 4 }}>Time: {timeStr} | Mistakes: {gs.mistakes}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button onClick={() => startGame(diffIdx)}
                style={{ padding: '10px 20px', fontSize: 16, background: '#3498db', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>New Game</button>
              <button onClick={() => setConfigured(false)}
                style={{ padding: '10px 20px', fontSize: 16, background: '#555', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Menu</button>
            </div>
          </div>
        )}
      </div>
    </GameWrapper>
  );
}
