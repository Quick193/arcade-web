/* eslint-disable react-hooks/immutability */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { GameOverlay } from '../components/GameOverlay';
import { MobileControlBar } from '../components/MobileControlBar';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';
import { useGameLoop } from '../hooks/useGameLoop';
import { useMobileCanvasSize } from '../hooks/useMobileCanvasSize';
import { useSfx } from '../hooks/useSfx';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 480;
const H = 300;
const GROUND_Y = 252;        // top of the ground surface
const PLAYER_W = 20;
const PLAYER_H = 26;         // small Mario
const PLAYER_H_BIG = 40;     // big/fire Mario
const PLAYER_X_SCREEN = 80;  // player locked screen-x when camera scrolling
const PLAYER_X_MIN = 16;
const BASE_RUN_SPEED = 2.4;  // auto-run speed (px/frame)
const SPRINT_SPEED = 3.8;    // right-held sprint
const SLOW_SPEED = 0.8;      // left-held slow
const REVERSE_SPEED = -1.0;  // left-held reverse when slow enough
const GRAVITY_FULL = 0.6;
const GRAVITY_HOLD = 0.24;   // reduced gravity while holding jump + ascending
const JUMP_VY = -12;
const JUMP_HOLD_MAX = 0.22;  // seconds of hold benefit
const FALL_CAP = 14;
const COYOTE_TIME = 0.10;    // seconds

// ─── Types ────────────────────────────────────────────────────────────────────
interface Platform { x: number; y: number; w: number; h: number; brick?: boolean }
interface Pipe     { x: number; y: number; w: number; h: number }
interface Enemy    {
  id: number; x: number; y: number; w: number; h: number;
  vx: number; alive: boolean; flat: boolean; flatTimer: number;
}
interface Coin     { x: number; y: number; collected: boolean }
interface QBlock   {
  x: number; y: number; used: boolean; hitAnim: number;
  item: 'coin' | 'mushroom' | 'fire' | 'star';
}
interface Fireball { x: number; y: number; vx: number; vy: number; dead: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; color: string; life: number }

interface GS {
  // Player world coords
  playerWX: number;  // world-x of player left edge
  playerY: number;
  vy: number;
  onGround: boolean;
  wasOnGround: boolean;
  coyoteTimer: number;
  jumpHeld: boolean;
  jumpHeldTime: number;
  jumpQueued: boolean;
  leftHeld: boolean;
  rightHeld: boolean;
  // Camera
  camX: number;      // world-x of left edge of screen
  // Power state
  bigMario: boolean;
  firepower: boolean;
  starTimer: number;
  invincTimer: number;
  // Projectiles
  fireballs: Fireball[];
  lastFireballTime: number;
  // World objects
  platforms: Platform[];
  pipes: Pipe[];
  enemies: Enemy[];
  coins: Coin[];
  qblocks: QBlock[];
  particles: Particle[];
  spawnEdge: number;  // world-x of rightmost generated terrain
  nextEnemyId: number;
  // Progress
  score: number;
  coinsCollected: number;
  lives: number;
  alive: boolean;
  started: boolean;
  frame: number;
  stompChain: number;
  bestSession: number;
  aiDisabled: boolean;
  chunksSpawned: number;
}

function initGs(): GS {
  const gs: GS = {
    playerWX: 60,
    playerY: GROUND_Y - PLAYER_H,
    vy: 0,
    onGround: true,
    wasOnGround: true,
    coyoteTimer: 0,
    jumpHeld: false,
    jumpHeldTime: 0,
    jumpQueued: false,
    leftHeld: false,
    rightHeld: false,
    camX: 0,
    bigMario: false,
    firepower: false,
    starTimer: 0,
    invincTimer: 0,
    fireballs: [],
    lastFireballTime: 0,
    platforms: [],
    pipes: [],
    enemies: [],
    coins: [],
    qblocks: [],
    particles: [],
    spawnEdge: 0,
    nextEnemyId: 1,
    score: 0,
    coinsCollected: 0,
    lives: 3,
    alive: true,
    started: false,
    frame: 0,
    stompChain: 0,
    bestSession: 0,
    aiDisabled: false,
    chunksSpawned: 0,
  };
  // Pre-spawn first 3 safe plain chunks
  spawnChunk(gs, 'plain');
  spawnChunk(gs, 'plain');
  spawnChunk(gs, 'plain');
  return gs;
}

// ─── Level Generation ─────────────────────────────────────────────────────────
type ChunkType = 'plain' | 'coins' | 'pipes' | 'goombas' | 'qblocks' | 'elevated' | 'gap';

function spawnChunk(gs: GS, forceType?: ChunkType) {
  const x = gs.spawnEdge;
  const difficulty = Math.min(1, gs.score / 4000);
  gs.chunksSpawned++;

  const typeRoll = Math.random();
  let type: ChunkType;
  if (forceType) {
    type = forceType;
  } else if (typeRoll < 0.14) {
    type = 'plain';
  } else if (typeRoll < 0.28) {
    type = 'coins';
  } else if (typeRoll < 0.42) {
    type = 'pipes';
  } else if (typeRoll < 0.56) {
    type = 'goombas';
  } else if (typeRoll < 0.70) {
    type = 'qblocks';
  } else if (typeRoll < 0.84) {
    type = 'elevated';
  } else {
    type = 'gap';
  }

  if (type === 'plain') {
    const w = 280 + Math.random() * 120;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const cnt = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < cnt; i++) {
      gs.coins.push({ x: x + 40 + i * 32, y: GROUND_Y - 56, collected: false });
    }
    gs.spawnEdge = x + w;

  } else if (type === 'coins') {
    const w = 320 + Math.random() * 80;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const cnt = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < cnt; i++) {
      gs.coins.push({ x: x + 30 + i * 28, y: GROUND_Y - 70, collected: false });
    }
    gs.spawnEdge = x + w;

  } else if (type === 'pipes') {
    const w = 380 + Math.random() * 70;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const cnt = 1 + Math.floor(Math.random() * (difficulty > 0.4 ? 3 : 2));
    for (let i = 0; i < cnt; i++) {
      const ph = 40 + Math.random() * 30;
      gs.pipes.push({ x: x + 55 + i * 95, y: GROUND_Y - ph, w: 32, h: ph });
    }
    gs.spawnEdge = x + w;

  } else if (type === 'goombas') {
    const w = 380 + Math.random() * 70;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const cnt = Math.min(4, 2 + Math.floor(Math.random() * 3 * difficulty + 1));
    for (let i = 0; i < cnt; i++) {
      const ex = x + 60 + i * 90;
      const speed = 0.9 + Math.random() * 0.6;
      gs.enemies.push({
        id: gs.nextEnemyId++,
        x: ex, y: GROUND_Y - 24, w: 22, h: 24,
        vx: -speed, alive: true, flat: false, flatTimer: 0,
      });
    }
    gs.spawnEdge = x + w;

  } else if (type === 'qblocks') {
    const w = 340 + Math.random() * 80;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const cnt = 2 + Math.floor(Math.random() * 3);
    const items: QBlock['item'][] = ['coin', 'coin', 'coin', 'mushroom', 'fire', 'star'];
    for (let i = 0; i < cnt; i++) {
      const bx = x + 50 + i * 90;
      gs.qblocks.push({
        x: bx, y: GROUND_Y - 90,
        used: false, hitAnim: 0,
        item: items[Math.floor(Math.random() * items.length)],
      });
    }
    gs.spawnEdge = x + w;

  } else if (type === 'elevated') {
    const w = 380 + Math.random() * 70;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const platY = GROUND_Y - 80 - Math.random() * 15;
    const platW = 80 + Math.random() * 60;
    gs.platforms.push({ x: x + 90, y: platY, w: platW, h: 14, brick: true });
    for (let i = 0; i < 3; i++) {
      gs.coins.push({ x: x + 100 + i * 28, y: platY - 24, collected: false });
    }
    if (Math.random() < 0.5) {
      const items: QBlock['item'][] = ['mushroom', 'coin', 'fire'];
      gs.qblocks.push({
        x: x + 100 + 3 * 28 + 10, y: platY - 26,
        used: false, hitAnim: 0,
        item: items[Math.floor(Math.random() * items.length)],
      });
    }
    gs.spawnEdge = x + w;

  } else {
    // gap
    const runupW = 120;
    const gapW = Math.min(80, 50 + Math.random() * 30 + difficulty * 20);
    const landW = 200 + Math.random() * 80;
    gs.platforms.push({ x, y: GROUND_Y, w: runupW, h: H - GROUND_Y });
    gs.platforms.push({ x: x + runupW + gapW, y: GROUND_Y, w: landW, h: H - GROUND_Y });
    // Optional bridge platform above gap center
    if (Math.random() < 0.55) {
      gs.platforms.push({
        x: x + runupW + gapW / 2 - 26, y: GROUND_Y - 72, w: 52, h: 12, brick: true,
      });
    }
    for (let i = 0; i < 3; i++) {
      gs.coins.push({ x: x + runupW + gapW + 20 + i * 28, y: GROUND_Y - 52, collected: false });
    }
    gs.spawnEdge = x + runupW + gapW + landW;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rOvlp(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx - rx * 0.55, cy + ry * 0.35, rx * 0.65, ry * 0.75, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + rx * 0.55, cy + ry * 0.35, rx * 0.65, ry * 0.75, 0, 0, Math.PI * 2); ctx.fill();
}

// ─── Component ───────────────────────────────────────────────────────────────
export function EndlessRunner() {
  const { recordGame, bestScore, navigate, state } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, getTraitValue, recordPlayerAction } = useAIDemo('runner');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gsRef = useRef<GS>(initGs());
  const hudSyncRef = useRef(0);
  const aiEnabledRef = useRef(aiDemoMode);
  const [displayScore, setDisplayScore] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'gameover'>('ready');
  const canvasSize = useMobileCanvasSize({ width: W, height: H, reservedVerticalSpace: 310 });
  const best = bestScore('runner');
  const sfx = useSfx();
  const sfxRef = useRef(sfx);
  sfxRef.current = sfx;
  const showParticlesRef = useRef(state.settings.showParticles);
  showParticlesRef.current = state.settings.showParticles;

  useEffect(() => {
    aiEnabledRef.current = aiDemoMode;
    if (aiDemoMode) gsRef.current.aiDisabled = false;
  }, [aiDemoMode]);

  const resetGame = useCallback(() => {
    const sessionBest = gsRef.current.bestSession;
    gsRef.current = initGs();
    gsRef.current.bestSession = sessionBest;
    hudSyncRef.current = 0;
    setDisplayScore(0);
    setPhase('ready');
  }, []);

  const startRun = useCallback((disableAi = false) => {
    const gs = gsRef.current;
    if (!gs.alive || gs.started) return;
    if (disableAi && aiEnabledRef.current) gs.aiDisabled = true;
    gs.started = true;
    setPhase('playing');
  }, []);

  const queueJump = useCallback((manual: boolean) => {
    const gs = gsRef.current;
    if (!gs.alive) return;
    if (manual && aiEnabledRef.current) gs.aiDisabled = true;
    if (!gs.started) { gs.started = true; setPhase('playing'); }
    gs.jumpQueued = true;
    gs.jumpHeld = true;
    gs.jumpHeldTime = 0;
  }, []);

  const releaseJump = useCallback(() => { gsRef.current.jumpHeld = false; }, []);

  const shootFireball = useCallback(() => {
    const gs = gsRef.current;
    if (!gs.alive || !gs.started || !gs.firepower) return;
    const now = performance.now();
    if (now - gs.lastFireballTime < 400) return;
    gs.lastFireballTime = now;
    gs.fireballs.push({
      x: gs.playerWX + PLAYER_W + 2,
      y: gs.playerY + (gs.bigMario || gs.firepower ? PLAYER_H_BIG : PLAYER_H) / 2,
      vx: 11, vy: -3, dead: false,
    });
    if (showParticlesRef.current) {
      for (let i = 0; i < 5; i++) {
        gs.particles.push({
          x: gs.playerWX + PLAYER_W,
          y: gs.playerY + (gs.bigMario || gs.firepower ? PLAYER_H_BIG : PLAYER_H) / 2,
          vx: 4 + Math.random() * 4, vy: (Math.random() - 0.5) * 3,
          color: i % 2 ? '#ff6600' : '#ffcc00', life: 0.4,
        });
      }
    }
    recordPlayerAction('shoot', { aggression: 0.8, precision: 0.6 });
  }, [recordPlayerAction]);

  const finishRun = useCallback((gs: GS) => {
    if (!gs.alive) return;
    gs.alive = false;
    recordGame('runner', false, gs.score, gs.frame / 60, { score: gs.score });
    setPhase('gameover');
    setDisplayScore(gs.score);
  }, [recordGame]);

  const takeDamage = useCallback((gs: GS) => {
    if (gs.invincTimer > 0 || gs.starTimer > 0) return;
    if (gs.firepower) {
      gs.firepower = false;
      gs.bigMario = true;
      gs.invincTimer = 1.8;
      return;
    }
    if (gs.bigMario) {
      gs.bigMario = false;
      gs.invincTimer = 1.8;
      if (showParticlesRef.current) {
        for (let i = 0; i < 8; i++) {
          gs.particles.push({
            x: gs.playerWX + PLAYER_W / 2, y: gs.playerY + PLAYER_H / 2,
            vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 3,
            color: i % 2 ? '#e52222' : '#f5c48a', life: 0.5,
          });
        }
      }
      return;
    }
    gs.lives -= 1;
    gs.stompChain = 0;
    gs.invincTimer = 2.2;
    if (gs.lives <= 0) {
      sfxRef.current('die');
      finishRun(gs);
      return;
    }
    // Respawn on ground
    gs.playerY = GROUND_Y - PLAYER_H;
    gs.vy = 0;
    gs.onGround = true;
  }, [finishRun]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');
    return () => { ctxRef.current = null; };
  }, []);

  // ── AI ───────────────────────────────────────────────────────────────────────
  const aiDecide = useCallback((gs: GS) => {
    if (!aiEnabledRef.current || gs.aiDisabled || !gs.alive) return;
    if (!gs.started) { gs.started = true; setPhase('playing'); }
    gs.rightHeld = false;
    gs.leftHeld = false;

    const px = gs.playerWX;
    const lookahead = isAdaptive
      ? 80 + getTraitValue('precision') * 80
      : 140;

    let shouldJump = false;

    // Jump over pipes
    for (const pipe of gs.pipes) {
      if (pipe.x > px && pipe.x < px + lookahead) { shouldJump = true; break; }
    }
    // Jump over/onto enemies
    if (!shouldJump) {
      for (const e of gs.enemies) {
        if (!e.alive || e.flat) continue;
        if (e.x > px && e.x < px + lookahead) { shouldJump = true; break; }
      }
    }
    // Jump over gaps
    if (!shouldJump) {
      let hasPlatformAhead = false;
      for (const p of gs.platforms) {
        if (p.x < px + 90 && p.x + p.w > px + PLAYER_W + 8 && p.y >= GROUND_Y - 4) {
          hasPlatformAhead = true; break;
        }
      }
      if (!hasPlatformAhead) shouldJump = true;
    }

    if (shouldJump && (gs.onGround || gs.coyoteTimer > 0)) {
      gs.jumpQueued = true;
      gs.jumpHeld = true;
    } else if (!shouldJump) {
      gs.jumpHeld = false;
    }

    if (gs.firepower) {
      for (const e of gs.enemies) {
        if (!e.alive || e.flat) continue;
        if (e.x > px && e.x < px + 260) { shootFireball(); break; }
      }
    }
  }, [getTraitValue, isAdaptive, shootFireball]);

  // ── Draw ─────────────────────────────────────────────────────────────────────
  const draw = useCallback((ctx: CanvasRenderingContext2D, gs: GS, ts: number) => {
    // Sky gradient
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, W, H);

    // Parallax clouds
    const CLOUD_DEFS = [
      { ox: 60, oy: 38, rx: 32, ry: 16 },
      { ox: 220, oy: 26, rx: 24, ry: 12 },
      { ox: 370, oy: 50, rx: 28, ry: 14 },
      { ox: 510, oy: 34, rx: 36, ry: 18 },
      { ox: 140, oy: 60, rx: 20, ry: 10 },
    ];
    const CLOUD_SCROLL = W + 140;
    const cloudOff = (gs.camX * 0.13) % CLOUD_SCROLL;
    for (const { ox, oy, rx, ry } of CLOUD_DEFS) {
      const cx = ((ox - cloudOff + CLOUD_SCROLL * 4) % CLOUD_SCROLL) - 40;
      drawCloud(ctx, cx, oy, rx, ry);
    }

    // World-space transform
    const offX = -gs.camX;
    ctx.save();
    ctx.translate(offX, 0);

    const vLeft = gs.camX - 60;
    const vRight = gs.camX + W + 60;

    // Platforms
    for (const p of gs.platforms) {
      if (p.x + p.w < vLeft || p.x > vRight) continue;
      if (p.h > 20) {
        // Ground: brown fill + grass top
        ctx.fillStyle = '#8b5e3c';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        // Brick lines
        ctx.strokeStyle = '#6b4020'; ctx.lineWidth = 1;
        const bH = 12; const bW = 24;
        for (let row = 0; row * bH < p.h; row++) {
          const offR = row % 2 === 0 ? 0 : bW / 2;
          for (let col = -1; col * bW < p.w + bW; col++) {
            ctx.strokeRect(p.x + col * bW + offR, p.y + row * bH, bW, bH);
          }
        }
        ctx.fillStyle = '#4fc940'; ctx.fillRect(p.x, p.y, p.w, 8);
        ctx.fillStyle = '#3ab830'; ctx.fillRect(p.x, p.y + 8, p.w, 2);
      } else {
        // Floating brick platform — orange
        ctx.fillStyle = '#c84b11';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = '#7a2e06'; ctx.lineWidth = 1.5;
        const bW = 14;
        for (let col = 0; col * bW < p.w; col++) {
          ctx.strokeRect(p.x + col * bW, p.y, bW, p.h);
        }
        ctx.fillStyle = '#e06020'; ctx.fillRect(p.x, p.y, p.w, 3);
      }
    }

    // Pipes — green with cap, solid walls
    for (const pipe of gs.pipes) {
      if (pipe.x + pipe.w < vLeft || pipe.x > vRight) continue;
      const capH = 8; const capE = 4;
      // Shaft
      ctx.fillStyle = '#2e8b2e';
      ctx.fillRect(pipe.x + 2, pipe.y + capH, pipe.w - 4, pipe.h - capH);
      ctx.fillStyle = '#3cb33c';
      ctx.fillRect(pipe.x + 4, pipe.y + capH, 5, pipe.h - capH);
      ctx.strokeStyle = '#1a5c1a'; ctx.lineWidth = 1;
      ctx.strokeRect(pipe.x + 2, pipe.y + capH, pipe.w - 4, pipe.h - capH);
      // Cap
      ctx.fillStyle = '#2e8b2e';
      ctx.fillRect(pipe.x - capE, pipe.y, pipe.w + capE * 2, capH);
      ctx.fillStyle = '#3cb33c';
      ctx.fillRect(pipe.x - capE + 2, pipe.y, 5, capH);
      ctx.strokeStyle = '#1a5c1a'; ctx.lineWidth = 1;
      ctx.strokeRect(pipe.x - capE, pipe.y, pipe.w + capE * 2, capH);
    }

    // Coins
    for (const coin of gs.coins) {
      if (coin.collected) continue;
      const pulse = 0.82 + 0.18 * Math.sin(ts / 180 + coin.x * 0.05);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(coin.x, coin.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e6a800'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(coin.x, coin.y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(coin.x - 1.5, coin.y - 2, 2, 1.2, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ? blocks
    for (const b of gs.qblocks) {
      if (b.x < vLeft || b.x > vRight) continue;
      const bounce = b.hitAnim > 0 ? -Math.sin(b.hitAnim * Math.PI * 5) * 7 : Math.sin(ts / 290 + b.x * 0.1) * 2;
      const bx = b.x; const by = b.y + bounce;
      ctx.fillStyle = b.used ? '#6b4500' : '#e8a000';
      ctx.fillRect(bx, by, 20, 20);
      ctx.fillStyle = b.used ? '#7a5200' : '#ffc800';
      ctx.fillRect(bx, by, 20, 3);
      ctx.fillRect(bx, by, 3, 20);
      ctx.fillStyle = b.used ? '#3a2200' : '#a06000';
      ctx.fillRect(bx, by + 17, 20, 3);
      ctx.fillRect(bx + 17, by, 3, 20);
      if (!b.used) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
        ctx.fillText('?', bx + 10, by + 14); ctx.textAlign = 'left';
      }
    }

    // Enemies — Goomba
    for (const e of gs.enemies) {
      if (!e.alive) continue;
      if (e.x + e.w < vLeft || e.x > vRight) continue;
      const { x: ex, y: ey, w: ew, h: eh } = e;
      if (e.flat) {
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(ex, ey + eh - 6, ew, 6);
        ctx.fillStyle = '#c47a3a';
        ctx.fillRect(ex + 2, ey + eh - 5, ew - 4, 3);
      } else {
        // Body (mushroom dome)
        ctx.fillStyle = '#8b4513';
        ctx.beginPath();
        ctx.arc(ex + ew / 2, ey + eh * 0.42, ew * 0.5, Math.PI, 0);
        ctx.rect(ex, ey + eh * 0.42, ew, eh * 0.58);
        ctx.fill();
        // Belly
        ctx.fillStyle = '#c47a3a';
        ctx.fillRect(ex + ew * 0.2, ey + eh * 0.48, ew * 0.6, eh * 0.25);
        // Angry brows
        ctx.strokeStyle = '#2a0a00'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ex + 3, ey + eh * 0.28); ctx.lineTo(ex + ew * 0.43, ey + eh * 0.38); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex + ew - 3, ey + eh * 0.28); ctx.lineTo(ex + ew * 0.57, ey + eh * 0.38); ctx.stroke();
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(ex + 3, ey + eh * 0.33, 5, 5);
        ctx.fillRect(ex + ew - 8, ey + eh * 0.33, 5, 5);
        ctx.fillStyle = '#111';
        ctx.fillRect(ex + 4, ey + eh * 0.36, 3, 3);
        ctx.fillRect(ex + ew - 7, ey + eh * 0.36, 3, 3);
        // Feet wobble
        const bob = Math.sin(gs.frame * 0.22 + e.x * 0.1) * 2;
        ctx.fillStyle = '#3a1a00';
        ctx.fillRect(ex + 1, ey + eh - 5 + bob, 8, 4);
        ctx.fillRect(ex + ew - 9, ey + eh - 5 - bob, 8, 4);
      }
    }

    // Fireballs
    for (const fb of gs.fireballs) {
      if (fb.dead) continue;
      if (fb.x < vLeft || fb.x > vRight) continue;
      ctx.save();
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(255,120,0,0.3)';
      ctx.beginPath(); ctx.arc(fb.x + 5, fb.y + 5, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6600';
      ctx.beginPath(); ctx.arc(fb.x + 5, fb.y + 5, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffee44';
      ctx.beginPath(); ctx.arc(fb.x + 4, fb.y + 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Player
    const ph = gs.bigMario || gs.firepower ? PLAYER_H_BIG : PLAYER_H;
    const pw = gs.bigMario || gs.firepower ? PLAYER_W + 4 : PLAYER_W;
    const px = gs.playerWX;
    const py = gs.playerY;
    const scale = gs.bigMario || gs.firepower ? 1.4 : 1.0;

    // Star flash aura
    if (gs.starTimer > 0) {
      ctx.save(); ctx.globalAlpha = 0.6;
      ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 24;
      ctx.fillStyle = `hsl(${Math.floor(ts / 40) % 360},100%,60%)`;
      ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, pw * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (gs.firepower) {
      ctx.save(); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(ts / 70);
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#ff6600';
      ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, pw * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = gs.invincTimer > 0 ? (Math.floor(ts / 80) % 2 === 0 ? 0.25 : 1) : 1;

    const capColor = gs.firepower ? '#ffffff' : '#e52222';
    // Hat
    ctx.fillStyle = capColor;
    ctx.fillRect(px + 1, py, pw - 2, Math.round(7 * scale));
    ctx.fillRect(px - 1, py + Math.round(5 * scale), pw + 2, Math.round(4 * scale));
    // Face
    ctx.fillStyle = '#f5c48a';
    ctx.fillRect(px + 2, py + Math.round(8 * scale), pw - 4, Math.round(9 * scale));
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(px + 4, py + Math.round(10 * scale), Math.round(3 * scale), Math.round(3 * scale));
    ctx.fillRect(px + pw - Math.round(7 * scale), py + Math.round(10 * scale), Math.round(3 * scale), Math.round(3 * scale));
    ctx.fillStyle = '#3a1a00';
    ctx.fillRect(px + 3, py + Math.round(14 * scale), pw - 6, Math.round(2 * scale));
    // Shirt
    const shirtColor = gs.firepower ? '#ff6600' : '#e52222';
    ctx.fillStyle = shirtColor;
    ctx.fillRect(px + 1, py + Math.round(17 * scale), pw - 2, Math.round(6 * scale));
    // Overalls
    ctx.fillStyle = '#3344cc';
    ctx.fillRect(px, py + Math.round(21 * scale), pw, Math.round(6 * scale));
    ctx.fillStyle = '#2233aa';
    ctx.fillRect(px + 3, py + Math.round(17 * scale), Math.round(4 * scale), Math.round(5 * scale));
    ctx.fillRect(px + pw - Math.round(7 * scale), py + Math.round(17 * scale), Math.round(4 * scale), Math.round(5 * scale));
    // Legs
    const moving = gs.leftHeld || gs.rightHeld;
    const legPhase = moving && gs.onGround ? Math.sin(gs.frame * 0.3) : 0;
    ctx.fillStyle = '#3344cc';
    ctx.fillRect(px + 2, py + ph - Math.round(9 * scale), Math.round(7 * scale), Math.round(9 * scale) + Math.round(legPhase * 3));
    ctx.fillRect(px + pw - Math.round(9 * scale), py + ph - Math.round(9 * scale), Math.round(7 * scale), Math.round(9 * scale) - Math.round(legPhase * 3));
    // Shoes
    ctx.fillStyle = '#5c2e00';
    ctx.fillRect(px + 1, py + ph - Math.round(3 * scale), Math.round(9 * scale), Math.round(3 * scale));
    ctx.fillRect(px + pw - Math.round(10 * scale), py + ph - Math.round(3 * scale), Math.round(9 * scale), Math.round(3 * scale));

    ctx.globalAlpha = 1;
    ctx.restore(); // pop world-space transform

    // Particles (in screen space)
    for (const p of gs.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x - gs.camX, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.58)'; ctx.fillRect(0, 0, W, 28);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffd700'; ctx.fillText(`SCORE: ${gs.score}`, 6, 19);
    ctx.fillStyle = '#ffd700'; ctx.fillText(`COINS: ${gs.coinsCollected}`, 140, 19);
    // Power indicator
    if (gs.starTimer > 0) {
      ctx.fillStyle = '#ffff00'; ctx.fillText(`STAR ${gs.starTimer.toFixed(1)}s`, W / 2 - 38, 19);
    } else if (gs.firepower) {
      ctx.fillStyle = '#ff6600'; ctx.fillText('FIRE', W / 2 - 14, 19);
    } else if (gs.bigMario) {
      ctx.fillStyle = '#ffffff'; ctx.fillText('BIG', W / 2 - 10, 19);
    }
    ctx.fillStyle = '#ff4444'; ctx.fillText(`LIVES: ${gs.lives}`, W - 90, 19);

    if (aiEnabledRef.current && !gs.aiDisabled && gs.alive) {
      ctx.fillStyle = 'rgba(0,200,255,0.85)'; ctx.fillRect(W / 2 + 28, 4, 34, 18);
      ctx.fillStyle = '#000'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('AI', W / 2 + 45, 17); ctx.textAlign = 'left';
    }
  }, []);

  // ── Step ─────────────────────────────────────────────────────────────────────
  const step = useCallback((dtMs: number, ts: number) => {
    const gs = gsRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;

    if (gs.alive && aiEnabledRef.current && !gs.aiDisabled) aiDecide(gs);

    if (gs.alive && gs.started) {
      gs.frame++;
      const dtCapped = Math.min(dtMs, 50);
      const dt = dtCapped / 1000;

      // Timers
      if (gs.starTimer > 0) gs.starTimer = Math.max(0, gs.starTimer - dt);
      if (gs.invincTimer > 0) gs.invincTimer = Math.max(0, gs.invincTimer - dt);
      if (gs.coyoteTimer > 0) gs.coyoteTimer = Math.max(0, gs.coyoteTimer - dt);

      // Flat-enemy timers
      for (const e of gs.enemies) {
        if (e.flat && e.alive) {
          e.flatTimer += dt;
          if (e.flatTimer >= 0.4) e.alive = false;
        }
      }

      // ── Horizontal movement ──────────────────────────────────────────────────
      let hSpeed: number;
      if (gs.rightHeld) {
        hSpeed = SPRINT_SPEED;
      } else if (gs.leftHeld) {
        hSpeed = SLOW_SPEED - BASE_RUN_SPEED; // net negative = slow/reverse
      } else {
        hSpeed = BASE_RUN_SPEED;
      }
      gs.playerWX += hSpeed;

      // ── Pipe horizontal collision (push back) ────────────────────────────────
      const ph = gs.bigMario || gs.firepower ? PLAYER_H_BIG : PLAYER_H;
      const pw = gs.bigMario || gs.firepower ? PLAYER_W + 4 : PLAYER_W;
      for (const pipe of gs.pipes) {
        const playerBottom = gs.playerY + ph;
        // Only block if player is beside the pipe (not above it completely)
        if (playerBottom > pipe.y + 2) {
          // Check horizontal overlap
          const overlapRight = gs.playerWX + pw > pipe.x && gs.playerWX < pipe.x + pipe.w;
          if (overlapRight) {
            // Push player back
            const midPlayer = gs.playerWX + pw / 2;
            if (midPlayer < pipe.x + pipe.w / 2) {
              gs.playerWX = pipe.x - pw;
            } else {
              gs.playerWX = pipe.x + pipe.w;
            }
          }
        }
      }

      // ── Vertical physics ─────────────────────────────────────────────────────
      const prevSy = gs.playerY;

      // Jump trigger
      const canJump = gs.onGround || gs.coyoteTimer > 0;
      if (gs.jumpQueued && canJump) {
        gs.vy = JUMP_VY;
        gs.onGround = false;
        gs.coyoteTimer = 0;
        gs.jumpHeldTime = 0;
        sfxRef.current('jump');
      }
      gs.jumpQueued = false;

      // Variable-height gravity
      if (gs.jumpHeld && gs.vy < 0) {
        gs.jumpHeldTime += dt;
        gs.vy += gs.jumpHeldTime < JUMP_HOLD_MAX ? GRAVITY_HOLD : GRAVITY_FULL;
      } else {
        gs.vy += GRAVITY_FULL;
      }
      gs.vy = Math.min(gs.vy, FALL_CAP);

      const newY = prevSy + gs.vy;
      gs.playerY = newY;

      // ── Sweep collision: platforms ──────────────────────────────────────────
      const prevBottom = prevSy + ph;
      gs.wasOnGround = gs.onGround;
      gs.onGround = false;

      for (const p of gs.platforms) {
        const newBottom = gs.playerY + ph;
        const playerLeft = gs.playerWX;
        const playerRight = gs.playerWX + pw;
        // Horizontal overlap with platform
        if (playerRight <= p.x || playerLeft >= p.x + p.w) continue;
        // Sweep through top (landing)
        if (gs.vy >= 0 && prevBottom <= p.y + 1 && newBottom > p.y) {
          gs.playerY = p.y - ph;
          gs.vy = 0;
          gs.onGround = true;
          break;
        }
        // Head bump (jumping into underside)
        if (gs.vy < 0 && gs.playerY < p.y + p.h && prevSy >= p.y + p.h - 2) {
          gs.playerY = p.y + p.h;
          gs.vy = Math.max(0, gs.vy);
        }
      }

      // Pipe tops — also standable via sweep
      for (const pipe of gs.pipes) {
        const newBottom = gs.playerY + ph;
        const playerLeft = gs.playerWX;
        const playerRight = gs.playerWX + pw;
        if (playerRight <= pipe.x - 4 || playerLeft >= pipe.x + pipe.w + 4) continue;
        if (gs.vy >= 0 && prevBottom <= pipe.y + 1 && newBottom > pipe.y) {
          gs.playerY = pipe.y - ph;
          gs.vy = 0;
          gs.onGround = true;
          break;
        }
      }

      // Coyote time
      if (gs.wasOnGround && !gs.onGround && gs.vy >= 0) {
        gs.coyoteTimer = Math.max(gs.coyoteTimer, COYOTE_TIME);
      }
      if (gs.onGround) { gs.coyoteTimer = 0; gs.jumpHeldTime = 0; }

      // ── Camera: scroll so player stays at PLAYER_X_SCREEN ───────────────────
      const targetCamX = gs.playerWX - PLAYER_X_SCREEN;
      if (targetCamX > gs.camX) {
        const dx = targetCamX - gs.camX;
        gs.camX = targetCamX;
        gs.score += Math.floor(dx);
      }
      // Don't let camera go left past start
      if (gs.camX < 0) gs.camX = 0;
      // Don't let player go behind left of screen
      if (gs.playerWX < gs.camX + PLAYER_X_MIN) {
        gs.playerWX = gs.camX + PLAYER_X_MIN;
      }

      // ── Spawn more terrain ───────────────────────────────────────────────────
      while (gs.spawnEdge < gs.camX + W + 700) spawnChunk(gs);

      // ── Cull old objects (> 300px behind camera) ─────────────────────────────
      const cullX = gs.camX - 300;
      gs.platforms = gs.platforms.filter(p => p.x + p.w > cullX);
      gs.pipes = gs.pipes.filter(p => p.x + p.w > cullX);
      gs.coins = gs.coins.filter(c => c.x > cullX);
      gs.enemies = gs.enemies.filter(e => e.x + e.w > cullX);
      gs.qblocks = gs.qblocks.filter(b => b.x > cullX);
      gs.fireballs = gs.fireballs.filter(f => !f.dead && f.x < gs.camX + W + 60 && f.x > cullX);
      gs.particles = gs.particles.filter(p => p.life > 0);

      // ── Enemy AI ─────────────────────────────────────────────────────────────
      const difficulty = Math.min(1, gs.score / 4000);
      for (const e of gs.enemies) {
        if (!e.alive || e.flat) continue;
        e.x += e.vx;

        // Turn at platform edges: check ground 4px ahead in walk direction
        const lookX = e.vx < 0 ? e.x - 4 : e.x + e.w + 4;
        let groundAhead = false;
        for (const p of gs.platforms) {
          if (lookX >= p.x && lookX <= p.x + p.w && p.y >= e.y + e.h - 2) {
            groundAhead = true; break;
          }
        }
        if (!groundAhead) { e.vx = -e.vx; continue; }

        // Turn at pipes
        for (const pipe of gs.pipes) {
          if (rOvlp(e.x, e.y, e.w, e.h, pipe.x - 2, pipe.y, pipe.w + 4, pipe.h)) {
            e.vx = -e.vx; break;
          }
        }

        // Speed up slightly with difficulty
        if (difficulty > 0.3) {
          const sign = e.vx < 0 ? -1 : 1;
          const baseSpeed = 0.9 + difficulty * 0.6;
          e.vx = sign * Math.min(1.5, baseSpeed);
        }
      }

      // ── Fireballs ─────────────────────────────────────────────────────────────
      for (const fb of gs.fireballs) {
        if (fb.dead) continue;
        fb.x += fb.vx;
        fb.vy += 0.45;
        fb.y += fb.vy;
        // Bounce on platform tops
        for (const p of gs.platforms) {
          if (fb.x > p.x && fb.x + 10 < p.x + p.w &&
              fb.y + 10 >= p.y && fb.y < p.y + 10 && fb.vy > 0) {
            fb.vy = -Math.abs(fb.vy) * 0.55;
            fb.y = p.y - 10;
            break;
          }
        }
        // Kill on pipe
        for (const pipe of gs.pipes) {
          if (rOvlp(fb.x, fb.y, 10, 10, pipe.x, pipe.y, pipe.w, pipe.h)) {
            fb.dead = true; break;
          }
        }
        if (fb.dead) continue;
        // Kill enemy
        for (const e of gs.enemies) {
          if (!e.alive || e.flat) continue;
          if (rOvlp(fb.x, fb.y, 10, 10, e.x, e.y, e.w, e.h)) {
            e.alive = false;
            gs.score += 200;
            fb.dead = true;
            if (showParticlesRef.current) {
              for (let i = 0; i < 6; i++) {
                gs.particles.push({
                  x: e.x + e.w / 2, y: e.y + e.h / 2,
                  vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 3,
                  color: i % 2 ? '#ff6600' : '#ffcc00', life: 0.6,
                });
              }
            }
            break;
          }
        }
      }

      // ── ? block hit from below ────────────────────────────────────────────────
      for (const b of gs.qblocks) {
        if (b.hitAnim > 0) b.hitAnim = Math.max(0, b.hitAnim - dt);
        if (b.used) continue;
        // Player head hits underside
        if (gs.vy < 0 &&
            gs.playerWX + pw > b.x + 1 && gs.playerWX < b.x + 19 &&
            gs.playerY <= b.y + 20 && gs.playerY >= b.y - 4) {
          b.used = true;
          b.hitAnim = 0.35;
          gs.vy = Math.max(0, gs.vy + 2);
          if (b.item === 'coin') {
            gs.coinsCollected++;
            gs.score += 10;
            if (showParticlesRef.current) {
              gs.particles.push({ x: b.x + 10, y: b.y - 8, vx: 0, vy: -3.5, color: '#ffd700', life: 0.6 });
            }
          } else if (b.item === 'mushroom') {
            if (!gs.bigMario && !gs.firepower) {
              gs.bigMario = true;
              gs.playerY -= (PLAYER_H_BIG - PLAYER_H); // shift up when growing
            }
          } else if (b.item === 'fire') {
            gs.firepower = true;
            gs.bigMario = true;
            if (!gs.bigMario) gs.playerY -= (PLAYER_H_BIG - PLAYER_H);
          } else if (b.item === 'star') {
            gs.starTimer = 10;
          }
          sfxRef.current('jump');
          if (showParticlesRef.current) {
            for (let i = 0; i < 5; i++) {
              gs.particles.push({
                x: b.x + 10, y: b.y - 6,
                vx: (Math.random() - 0.5) * 3, vy: -2.5 - Math.random() * 2,
                color: '#ffd700', life: 0.55,
              });
            }
          }
        }
      }

      // ── Coin collection ────────────────────────────────────────────────────────
      for (const coin of gs.coins) {
        if (coin.collected) continue;
        const cx = gs.playerWX + pw / 2;
        const cy = gs.playerY + ph / 2;
        if (Math.hypot(coin.x - cx, coin.y - cy) < 24) {
          coin.collected = true;
          gs.coinsCollected++;
          gs.score += 10;
          if (showParticlesRef.current) {
            gs.particles.push({ x: coin.x, y: coin.y, vx: 0, vy: -3, color: '#ffd700', life: 0.45 });
          }
        }
      }

      // ── Enemy collision ────────────────────────────────────────────────────────
      for (const e of gs.enemies) {
        if (!e.alive || e.flat) continue;
        if (!rOvlp(gs.playerWX, gs.playerY, pw, ph, e.x, e.y, e.w, e.h)) continue;
        if (gs.starTimer > 0) {
          e.alive = false;
          gs.score += 200;
          continue;
        }
        // Stomp: falling AND player bottom within 10px of enemy top AND horizontal overlap
        const playerBottom = gs.playerY + ph;
        const enemyTop = e.y;
        if (gs.vy > 0 && playerBottom - enemyTop <= 10) {
          e.flat = true;
          e.flatTimer = 0;
          gs.vy = -8;
          gs.stompChain++;
          gs.score += Math.min(gs.stompChain, 5) * 100;
          sfxRef.current('jump');
          if (showParticlesRef.current) {
            for (let i = 0; i < 6; i++) {
              gs.particles.push({
                x: e.x + e.w / 2, y: e.y + e.h / 2,
                vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 2,
                color: '#ffd700', life: 0.45,
              });
            }
          }
        } else {
          takeDamage(gs);
        }
        break;
      }

      // ── Fell into pit ──────────────────────────────────────────────────────────
      if (gs.playerY > H + 60) {
        gs.bigMario = false;
        gs.firepower = false;
        takeDamage(gs);
        if (gs.alive) {
          gs.playerWX = gs.camX + PLAYER_X_SCREEN;
          gs.playerY = GROUND_Y - PLAYER_H;
          gs.vy = 0;
          gs.onGround = true;
        }
      }

      // ── Particles ──────────────────────────────────────────────────────────────
      for (const p of gs.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.life -= 0.04;
      }

      if (gs.score > gs.bestSession) gs.bestSession = gs.score;
    }

    draw(ctx, gs, ts);

    hudSyncRef.current += dtMs;
    if (hudSyncRef.current >= 120 || !gs.alive || !gs.started) {
      hudSyncRef.current = 0;
      setDisplayScore(gs.score);
      if (!gs.started && phase !== 'ready') setPhase('ready');
      if (gs.started && gs.alive && phase !== 'playing') setPhase('playing');
      if (!gs.alive && phase !== 'gameover') setPhase('gameover');
    }
  }, [aiDecide, draw, phase, takeDamage]);

  useGameLoop(step);

  const handleJump = useCallback(() => {
    if (phase === 'gameover') return;
    recordPlayerAction('jump', { aggression: 0.58, risk: 0.52, tempo: 0.6 });
    queueJump(true);
  }, [phase, queueJump, recordPlayerAction]);

  const handleJumpRelease = useCallback(() => releaseJump(), [releaseJump]);
  const handleLeft = useCallback(() => { startRun(true); gsRef.current.leftHeld = true; gsRef.current.aiDisabled = true; }, [startRun]);
  const handleLeftRelease = useCallback(() => { gsRef.current.leftHeld = false; }, []);
  const handleRight = useCallback(() => { startRun(true); gsRef.current.rightHeld = true; gsRef.current.aiDisabled = true; }, [startRun]);
  const handleRightRelease = useCallback(() => { gsRef.current.rightHeld = false; }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'KeyW', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyF'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') handleJump();
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') handleLeft();
      if (e.code === 'ArrowRight' || e.code === 'KeyD') handleRight();
      if (e.code === 'KeyF') shootFireball();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') handleJumpRelease();
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') handleLeftRelease();
      if (e.code === 'ArrowRight' || e.code === 'KeyD') handleRightRelease();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleJump, handleJumpRelease, handleLeft, handleLeftRelease, handleRight, handleRightRelease, shootFireball]);

  return (
    <GameWrapper
      title="Mario Run"
      score={displayScore}
      onRestart={resetGame}
      footer={best > 0 ? <div className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Best: {best.toLocaleString()}</div> : undefined}
      controls={(
        <MobileControlBar
          items={[
            { id: 'left', label: '◀', onPress: handleLeft, onRelease: handleLeftRelease },
            { id: 'jump', label: 'JUMP', onPress: handleJump, onRelease: handleJumpRelease, tone: 'accent' },
            { id: 'right', label: '▶', onPress: handleRight, onRelease: handleRightRelease },
            { id: 'fire', label: 'FIRE', onPress: shootFireball, tone: 'danger' },
          ]}
          hint="Auto-runs right · JUMP (hold = higher) · ◀ = slow/reverse · FIRE = fireball"
        />
      )}
    >
      <div className="relative flex w-full justify-center">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={handleJump}
          onPointerUp={handleJumpRelease}
          onPointerLeave={handleJumpRelease}
          className="game-canvas rounded-[28px] border border-white/10 bg-black/20 shadow-2xl"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        />
        <GameOverlay
          visible={phase !== 'playing'}
          eyebrow={phase === 'ready' ? 'Mario Run' : 'Run Ended'}
          title={phase === 'ready' ? 'Auto-runs right!' : 'Try again?'}
          subtitle={phase === 'ready'
            ? 'Stomp Goombas, hit ? blocks from below for powerups!'
            : 'Stomp Goombas · hit ? blocks · Fire Flower = shoot fireballs'}
          score={displayScore}
          best={best}
          primaryLabel={phase === 'ready' ? 'Start' : 'Play Again'}
          onPrimary={phase === 'ready' ? () => queueJump(false) : resetGame}
          secondaryLabel="Back to Hub"
          onSecondary={() => navigate('menu')}
        />
      </div>
    </GameWrapper>
  );
}
