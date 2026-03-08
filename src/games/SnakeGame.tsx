import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';

const GRID = 20;
const CELL = 16;
const W = GRID * CELL;
const H = GRID * CELL;

type Dir = 'U' | 'D' | 'L' | 'R';
interface Pt { x: number; y: number; }

interface Powerup {
  x: number; y: number; type: number; timer: number;
}
interface Obstacle { x: number; y: number; }

const POWERUP_NAMES = ['⚡Speed','🐌Slow','⭐Invincible','✂️Shrink','×2 Double'];
const POWERUP_COLORS = ['#ffeb3b','#80deea','#fff176','#ff8a65','#ce93d8'];

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

interface GS {
  snake: Pt[];
  dir: Dir;
  nextDir: Dir;
  food: Pt;
  score: number;
  level: number;
  foodCount: number;
  lives: number;
  powerups: Powerup[];
  obstacles: Obstacle[];
  activePowerup: number | null;
  activePowerupTimer: number;
  doubleScore: boolean;
  invincible: boolean;
  gameOver: boolean;
  paused: boolean;
  lastTime: number;
  moveTimer: number;
  baseSpeed: number;
  effectiveSpeed: number;
  shrinkingBorder: number;
  startTime: number;
  aiDisabled: boolean;
}

function makeFood(snake: Pt[], obstacles: Obstacle[], powerups: Powerup[]): Pt {
  const occupied = new Set(snake.map(p => `${p.x},${p.y}`).concat(obstacles.map(o => `${o.x},${o.y}`)).concat(powerups.map(p => `${p.x},${p.y}`)));
  let pt: Pt;
  do { pt = { x: randInt(0, GRID-1), y: randInt(0, GRID-1) }; } while (occupied.has(`${pt.x},${pt.y}`));
  return pt;
}

function spawnPowerup(snake: Pt[], obstacles: Obstacle[], existing: Powerup[]): Powerup | null {
  if (existing.length >= 2) return null;
  const occupied = new Set(snake.map(p => `${p.x},${p.y}`).concat(obstacles.map(o => `${o.x},${o.y}`)).concat(existing.map(p => `${p.x},${p.y}`)));
  let pt: Pt;
  let tries = 0;
  do { pt = { x: randInt(1, GRID-2), y: randInt(1, GRID-2) }; tries++; } while (occupied.has(`${pt.x},${pt.y}`) && tries < 50);
  if (tries >= 50) return null;
  return { ...pt, type: randInt(0, 4), timer: 8000 };
}

function bfsPath(snake: Pt[], food: Pt, obstacles: Obstacle[], border: number): Dir[] {
  const occupied = new Set(snake.slice(1).map(p => `${p.x},${p.y}`).concat(obstacles.map(o => `${o.x},${o.y}`)));
  const head = snake[0];
  const dirs: Dir[] = ['U','D','L','R'];
  const dmap: Record<Dir,[number,number]> = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] };
  const queue: Array<{pt: Pt; path: Dir[]}> = [{ pt: head, path: [] }];
  const visited = new Set<string>([`${head.x},${head.y}`]);
  while (queue.length) {
    const { pt, path } = queue.shift()!;
    for (const d of dirs) {
      const [dx, dy] = dmap[d];
      const nx = pt.x + dx, ny = pt.y + dy;
      const key = `${nx},${ny}`;
      if (nx < border || nx >= GRID - border || ny < border || ny >= GRID - border) continue;
      if (occupied.has(key) || visited.has(key)) continue;
      const np = [...path, d];
      if (nx === food.x && ny === food.y) return np;
      visited.add(key);
      queue.push({ pt: { x: nx, y: ny }, path: np });
    }
  }
  return [];
}

function floodFill(head: Pt, snake: Pt[], obstacles: Obstacle[], border: number): number {
  const occupied = new Set(snake.slice(1).map(p => `${p.x},${p.y}`).concat(obstacles.map(o => `${o.x},${o.y}`)));
  const queue = [head];
  const visited = new Set<string>([`${head.x},${head.y}`]);
  while (queue.length) {
    const { x, y } = queue.shift()!;
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < border || nx >= GRID - border || ny < border || ny >= GRID - border) continue;
      if (occupied.has(key) || visited.has(key)) continue;
      visited.add(key); queue.push({ x: nx, y: ny });
    }
  }
  return visited.size;
}

export function SnakeGame() {
  const { recordGame, checkAchievements } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, mode: demoMode, cycleMode, getActionWeight, getTraitValue, recordPlayerAction } = useAIDemo('snake');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GS | null>(null);
  const rafRef = useRef<number>(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(3);
  const aiDemoRef = useRef(aiDemoMode);
  aiDemoRef.current = aiDemoMode;
  const aiOnRef = useRef(aiDemoMode);
  aiOnRef.current = aiDemoMode;
  const demoLabel = demoMode === 'adaptive' ? '🧠 Learn Me' : aiDemoMode ? '🤖 Classic AI' : '🎮 Demo Off';

  const initGame = useCallback(() => {
    const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    const food = makeFood(snake, [], []);
    gsRef.current = {
      snake, dir: 'R', nextDir: 'R', food,
      score: 0, level: 1, foodCount: 0, lives: 3,
      powerups: [], obstacles: [], activePowerup: null,
      activePowerupTimer: 0, doubleScore: false, invincible: false,
      gameOver: false, paused: false, lastTime: performance.now(),
      moveTimer: 0, baseSpeed: 200, effectiveSpeed: 200,
      shrinkingBorder: 0, startTime: Date.now(), aiDisabled: false,
    };
  }, []);

  useEffect(() => {
    initGame();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let powerupSpawnTimer = 5000;

    function doMove() {
      const gs = gsRef.current;
      if (!gs) return;
      const head = gs.snake[0];
      const dmap: Record<Dir,[number,number]> = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] };
      const [dx, dy] = dmap[gs.dir];
      let nx = head.x + dx, ny = head.y + dy;
      nx = ((nx % GRID) + GRID) % GRID;
      ny = ((ny % GRID) + GRID) % GRID;

      const border = gs.shrinkingBorder;
      const hitBorder = nx < border || nx >= GRID - border || ny < border || ny >= GRID - border;
      const hitObstacle = gs.obstacles.some(o => o.x === nx && o.y === ny);
      const hitSelf = gs.snake.slice(1).some(p => p.x === nx && p.y === ny);

      if ((hitBorder || hitObstacle || hitSelf) && !gs.invincible) {
        gs.lives--;
        if (gs.lives <= 0) {
          gs.gameOver = true;
          const dur = (Date.now() - gs.startTime) / 1000;
          recordGame('snake', false, gs.score, dur);
          checkAchievements('snake', { score: gs.score });
        } else {
          const newSnake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
          gs.snake = newSnake;
          gs.dir = 'R'; gs.nextDir = 'R';
          gs.activePowerup = null; gs.activePowerupTimer = 0;
          gs.doubleScore = false; gs.invincible = false;
        }
        return;
      }

      const newHead = { x: nx, y: ny };
      gs.snake.unshift(newHead);
      let ateFood = nx === gs.food.x && ny === gs.food.y;
      if (ateFood) {
        const pts = 10 * gs.level * (gs.doubleScore ? 2 : 1);
        gs.score += pts;
        gs.foodCount++;
        if (gs.foodCount % 5 === 0) {
          gs.level++;
          gs.baseSpeed = Math.max(80, 200 - (gs.level - 1) * 15);
        }
        gs.food = makeFood(gs.snake, gs.obstacles, gs.powerups);
        if (gs.level >= 4 && gs.obstacles.length < 3) {
          for (let i = gs.obstacles.length; i < 3; i++) {
            const occ = new Set(gs.snake.map(p => `${p.x},${p.y}`).concat(gs.obstacles.map(o => `${o.x},${o.y}`)));
            let op: Pt;
            do { op = { x: randInt(2, GRID-3), y: randInt(2, GRID-3) }; } while (occ.has(`${op.x},${op.y}`));
            gs.obstacles.push(op);
          }
        }
        if (gs.level >= 7 && gs.obstacles.length < 5) {
          for (let i = gs.obstacles.length; i < 5; i++) {
            const occ = new Set(gs.snake.map(p => `${p.x},${p.y}`).concat(gs.obstacles.map(o => `${o.x},${o.y}`)));
            let op: Pt;
            do { op = { x: randInt(2, GRID-3), y: randInt(2, GRID-3) }; } while (occ.has(`${op.x},${op.y}`));
            gs.obstacles.push(op);
          }
        }
        if (gs.level >= 6) gs.shrinkingBorder = Math.min(3, Math.floor((gs.level - 6) / 2) + 1);
      } else {
        gs.snake.pop();
      }

      // Check powerup pickup
      for (let i = gs.powerups.length - 1; i >= 0; i--) {
        const pw = gs.powerups[i];
        if (pw.x === nx && pw.y === ny) {
          gs.powerups.splice(i, 1);
          gs.activePowerup = pw.type;
          const durations = [5000, 8000, 6000, 0, 10000];
          gs.activePowerupTimer = durations[pw.type];
          if (pw.type === 0) gs.effectiveSpeed = gs.baseSpeed / 2;
          else if (pw.type === 1) gs.effectiveSpeed = gs.baseSpeed * 2;
          else if (pw.type === 2) gs.invincible = true;
          else if (pw.type === 3) { gs.snake = gs.snake.slice(0, Math.max(1, gs.snake.length - 3)); gs.activePowerup = null; }
          else if (pw.type === 4) gs.doubleScore = true;
        }
      }
    }

    function render() {
      const gs = gsRef.current;
      if (!gs) return;
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, W, H);
      // Grid dots
      ctx.fillStyle = '#1a2030';
      for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) {
        ctx.fillRect(x * CELL + CELL/2 - 1, y * CELL + CELL/2 - 1, 2, 2);
      }
      // Shrinking border
      const b = gs.shrinkingBorder;
      if (b > 0) {
        ctx.fillStyle = 'rgba(180,0,0,0.35)';
        for (let x = 0; x < GRID; x++) {
          for (let y = 0; y < GRID; y++) {
            if (x < b || x >= GRID - b || y < b || y >= GRID - b) {
              ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
            }
          }
        }
      }
      // Obstacles
      ctx.fillStyle = '#666';
      for (const o of gs.obstacles) ctx.fillRect(o.x * CELL + 1, o.y * CELL + 1, CELL - 2, CELL - 2);
      // Food (pulsing)
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      ctx.fillStyle = `rgb(${220 + Math.floor(pulse * 35)},50,50)`;
      ctx.beginPath();
      ctx.arc(gs.food.x * CELL + CELL/2, gs.food.y * CELL + CELL/2, CELL/2 - 1, 0, Math.PI * 2);
      ctx.fill();
      // Powerups
      for (const pw of gs.powerups) {
        ctx.fillStyle = POWERUP_COLORS[pw.type];
        ctx.fillRect(pw.x * CELL + 2, pw.y * CELL + 2, CELL - 4, CELL - 4);
        ctx.fillStyle = '#000';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(['⚡','🐌','⭐','✂','×2'][pw.type], pw.x * CELL + CELL/2, pw.y * CELL + CELL/2 + 3);
      }
      // Snake
      for (let i = 0; i < gs.snake.length; i++) {
        const p = gs.snake[i];
        const t = 1 - i / gs.snake.length;
        if (i === 0) {
          ctx.fillStyle = gs.invincible ? '#fff176' : `rgb(${Math.floor(100 + t * 100)},255,${Math.floor(50 + t * 50)})`;
        } else {
          ctx.fillStyle = `rgb(${Math.floor(30 + t * 60)},${Math.floor(150 + t * 80)},${Math.floor(30 + t * 30)})`;
        }
        ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
      }
      // HUD
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, 22);
      ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`Score: ${gs.score}  Lv:${gs.level}`, 4, 15);
      ctx.textAlign = 'right';
      ctx.fillText(`Lives: ${'♥'.repeat(gs.lives)}`, W - 4, 15);
      if (gs.activePowerup !== null && gs.activePowerup !== 3) {
        ctx.fillStyle = POWERUP_COLORS[gs.activePowerup];
        ctx.textAlign = 'center';
        ctx.fillText(POWERUP_NAMES[gs.activePowerup] + ` ${(gs.activePowerupTimer/1000).toFixed(1)}s`, W/2, 15);
      }
      // AI badge
      if (aiOnRef.current && !gs.aiDisabled) {
        ctx.fillStyle = 'rgba(0,200,255,0.85)';
        ctx.beginPath();
        ctx.roundRect(W/2 - 28, 26, 56, 20, 5);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🤖 AI ON', W/2, 40);
        ctx.textAlign = 'left';
      }
      if (gs.gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff5'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', W/2, H/2 - 20);
        ctx.fillStyle = '#fff'; ctx.font = '14px monospace';
        ctx.fillText(`Score: ${gs.score}`, W/2, H/2 + 10);
        ctx.fillStyle = '#88f';
        ctx.fillText('Tap or press R to restart', W/2, H/2 + 35);
      }
      if (gs.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0,0,W,H);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
        ctx.fillText('PAUSED', W/2, H/2);
      }
    }

    function aiStep(dt: number) {
      const gs = gsRef.current;
      if (!gs || gs.gameOver || gs.paused) return;
      const path = bfsPath(gs.snake, gs.food, gs.obstacles, gs.shrinkingBorder);
      const weightedDir = (dirs: Dir[]) => {
        return dirs.reduce((best, dir) => {
          const rank = getActionWeight(`dir:${dir}`) + (dir === gs.dir ? 0.05 : 0);
          return rank > best.rank ? { dir, rank } : best;
        }, { dir: dirs[0], rank: -Infinity }).dir;
      };
      if (path.length > 0) {
        const nextDir = path[0];
        const area = floodFill({ x: gs.snake[0].x + [0,0,-1,1][['U','D','L','R'].indexOf(nextDir)], y: gs.snake[0].y + [-1,1,0,0][['U','D','L','R'].indexOf(nextDir)] }, gs.snake, gs.obstacles, gs.shrinkingBorder);
        if (area > gs.snake.length) {
          gs.nextDir = isAdaptive && path.length > 1 && getTraitValue('exploration') > 0.6
            ? weightedDir([nextDir, path[1]])
            : nextDir;
          return;
        }
      }
      // survival: flood fill all directions
      const dmap: Record<Dir,[number,number]> = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] };
      const dirs: Dir[] = ['U','D','L','R'];
      const opposite: Record<Dir,Dir> = { U:'D', D:'U', L:'R', R:'L' };
      let bestDir: Dir = gs.dir, bestArea = -1;
      for (const d of dirs) {
        if (d === opposite[gs.dir]) continue;
        const [dx, dy] = dmap[d];
        const nx = gs.snake[0].x + dx, ny = gs.snake[0].y + dy;
        const b = gs.shrinkingBorder;
        if (nx < b || nx >= GRID-b || ny < b || ny >= GRID-b) continue;
        if (gs.obstacles.some(o => o.x === nx && o.y === ny)) continue;
        if (gs.snake.slice(1).some(p => p.x === nx && p.y === ny)) continue;
        const area2 = floodFill({ x: nx, y: ny }, gs.snake, gs.obstacles, gs.shrinkingBorder);
        if (area2 > bestArea) { bestArea = area2; bestDir = d; }
      }
      const preferred = dirs
        .filter((d) => {
          const [dx, dy] = dmap[d];
          const nx = gs.snake[0].x + dx, ny = gs.snake[0].y + dy;
          const b = gs.shrinkingBorder;
          return !(d === opposite[gs.dir] || nx < b || nx >= GRID-b || ny < b || ny >= GRID-b || gs.obstacles.some(o => o.x === nx && o.y === ny) || gs.snake.slice(1).some(p => p.x === nx && p.y === ny));
        });
      gs.nextDir = isAdaptive && preferred.length
        ? weightedDir(preferred.filter((d) => d === bestDir || getActionWeight(`dir:${d}`) > 1.15))
        : bestDir;
      void dt;
    }

    function gameLoop(timestamp: number) {
      const gs = gsRef.current;
      if (!gs) return;
      const dt = Math.min(timestamp - gs.lastTime, 100);
      gs.lastTime = timestamp;
      if (!gs.paused && !gs.gameOver) {
        if (aiOnRef.current && !gs.aiDisabled) aiStep(dt);
        gs.moveTimer += dt;
        gs.effectiveSpeed = gs.activePowerup === 0 ? gs.baseSpeed / 2 : gs.activePowerup === 1 ? gs.baseSpeed * 2 : gs.baseSpeed;
        if (gs.moveTimer >= gs.effectiveSpeed) {
          gs.moveTimer = 0;
          const opposite: Record<Dir,Dir> = { U:'D', D:'U', L:'R', R:'L' };
          if (gs.nextDir !== opposite[gs.dir]) gs.dir = gs.nextDir;
          doMove();
        }
        if (gs.activePowerupTimer > 0) {
          gs.activePowerupTimer -= dt;
          if (gs.activePowerupTimer <= 0) {
            gs.activePowerup = null; gs.doubleScore = false; gs.invincible = false;
          }
        }
        powerupSpawnTimer -= dt;
        if (powerupSpawnTimer <= 0) {
          powerupSpawnTimer = 8000 + Math.random() * 4000;
          const pw = spawnPowerup(gs.snake, gs.obstacles, gs.powerups);
          if (pw) gs.powerups.push(pw);
        }
        for (let i = gs.powerups.length - 1; i >= 0; i--) {
          gs.powerups[i].timer -= dt;
          if (gs.powerups[i].timer <= 0) gs.powerups.splice(i, 1);
        }
      }
      setDisplayScore(gs.score);
      setDisplayLives(gs.lives);
      render();
      rafRef.current = requestAnimationFrame(gameLoop);
    }

    rafRef.current = requestAnimationFrame(gameLoop);

    const onKey = (e: KeyboardEvent) => {
      const gs = gsRef.current;
      if (!gs) return;
      if (e.key === 'r' || e.key === 'R') { if (gs.gameOver) { initGame(); powerupSpawnTimer = 5000; return; } }
      if (e.key === 'p' || e.key === 'P') { gs.paused = !gs.paused; return; }
      const map: Record<string, Dir> = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' };
      if (map[e.key]) {
        gs.nextDir = map[e.key];
        recordPlayerAction(`dir:${map[e.key]}`, {
          aggression: 0.52,
          risk: map[e.key] === 'U' ? 0.46 : 0.54,
          exploration: map[e.key] === 'L' || map[e.key] === 'R' ? 0.68 : 0.4,
        });
      }
    };
    // Only disable AI when player presses directional keys
    const stopAI = (e: KeyboardEvent) => {
      const dirKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','s','a','d','W','S','A','D'];
      if (dirKeys.includes(e.key) && aiOnRef.current) { const gs = gsRef.current; if (gs) gs.aiDisabled = true; }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', stopAI, true);

    const el = canvas;
    let tapTimeout: ReturnType<typeof setTimeout> | null = null;
    el.addEventListener('touchend', (e) => {
      const gs = gsRef.current;
      if (!gs) return;
      if (gs.gameOver) { initGame(); powerupSpawnTimer = 5000; return; }
      // Touch swipe to steer disables AI
      if (aiOnRef.current) gs.aiDisabled = true;
      const t = e.changedTouches[0];
      const rect = el.getBoundingClientRect();
      const tx = t.clientX - rect.left, ty = t.clientY - rect.top;
      const cx = W / 2, cy = H / 2;
      const dx = tx - cx, dy = ty - cy;
      if (tapTimeout) clearTimeout(tapTimeout);
      tapTimeout = setTimeout(() => {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
        gs.nextDir = dir;
        recordPlayerAction(`dir:${dir}`, {
          aggression: 0.52,
          risk: dir === 'U' ? 0.46 : 0.54,
          exploration: dir === 'L' || dir === 'R' ? 0.68 : 0.4,
        });
      }, 50);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', stopAI, true);
    };
  }, [initGame, recordGame, checkAchievements]);

  // Re-enable AI when setting turns on
  useEffect(() => {
    const gs = gsRef.current;
    if (gs && aiDemoMode) gs.aiDisabled = false;
  }, [aiDemoMode]);

  const toggleAI = useCallback(() => {
    const gs = gsRef.current;
    if (gs) gs.aiDisabled = false;
    cycleMode();
  }, [cycleMode]);

  const dpadBtn = (label: string, dir: Dir) => (
    <button
      key={dir}
      onPointerDown={() => {
        const gs = gsRef.current;
        if (gs) {
          gs.nextDir = dir;
          recordPlayerAction(`dir:${dir}`, {
            aggression: 0.52,
            risk: dir === 'U' ? 0.46 : 0.54,
            exploration: dir === 'L' || dir === 'R' ? 0.68 : 0.4,
          });
          if (aiOnRef.current) gs.aiDisabled = true; // Player taking over
        }
      }}
      style={{ width: 48, height: 48, fontSize: 20, background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 8, cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
    >{label}</button>
  );

  return (
    <GameWrapper title="Snake 2.0" score={displayScore} extra={<span style={{ color: '#f66', fontSize: 14 }}>{'♥'.repeat(displayLives)}</span>} onRestart={initGame}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <canvas ref={canvasRef} width={W} height={H} style={{ maxWidth: '100%', imageRendering: 'pixelated', border: '2px solid #333' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={toggleAI}
            style={{ padding: '5px 14px', fontSize: 12, background: demoMode === 'adaptive' ? '#7b1fa2' : aiDemoMode ? '#0288d1' : '#333', color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer' }}>
            {demoLabel}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '48px 48px 48px', gridTemplateRows: '48px 48px', gap: 4 }}>
          <div />{dpadBtn('▲','U')}<div />
          {dpadBtn('◀','L')}{dpadBtn('▼','D')}{dpadBtn('▶','R')}
        </div>
      </div>
    </GameWrapper>
  );
}
