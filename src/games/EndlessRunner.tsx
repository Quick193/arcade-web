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
const H = 320;
const GRAVITY = 0.5;
const JUMP_POWER = -9.5;
const GROUND_Y = 260;        // top of the ground surface
const PLAYER_W = 22;
const PLAYER_H = 28;         // small Mario height
const PLAYER_H_BIG = 42;     // big Mario height
const PLAYER_X_DEFAULT = 72;
const PLAYER_X_MIN = 18;
const CAMERA_RIGHT = 200;    // player screen-x where camera locks and world scrolls
const MOVE_SPEED = 3.0;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Platform { x: number; y: number; w: number; h: number }
interface Enemy    { x: number; y: number; w: number; h: number; vx: number; alive: boolean; flat: boolean }
interface Pipe     { x: number; y: number; w: number; h: number }
interface Coin     { x: number; y: number; collected: boolean }
interface QBlock   { x: number; y: number; used: boolean; hitAnim: number; item: 'mushroom' | 'fireball' | 'star' | 'coin' }
interface Fireball { x: number; y: number; vx: number; vy: number }
interface Particle { x: number; y: number; vx: number; vy: number; color: string; life: number }

interface GS {
  // Player
  playerX: number;   // screen-space
  playerY: number;
  playerVY: number;
  onGround: boolean;
  coyoteTimer: number;
  jumpHeld: boolean;
  jumpHeldTime: number;
  jumpQueued: boolean;
  leftHeld: boolean;
  rightHeld: boolean;
  // Powers
  bigMario: boolean;
  firepower: boolean;
  starTimer: number;   // invincibility star seconds remaining
  invincTimer: number; // brief post-hit invincibility
  // Projectiles
  fireballs: Fireball[];
  lastFireball: number;
  // World
  worldX: number;     // camera offset
  platforms: Platform[];
  enemies: Enemy[];
  pipes: Pipe[];
  coins: Coin[];
  qblocks: QBlock[];
  particles: Particle[];
  spawnEdge: number;  // world-x of rightmost spawned terrain
  // Progress
  score: number;
  coinsCollected: number;
  lives: number;
  alive: boolean;
  started: boolean;
  frame: number;
  stompChain: number;
  aiDisabled: boolean;
  bestSession: number;
}

function initGs(): GS {
  return {
    playerX: PLAYER_X_DEFAULT,
    playerY: GROUND_Y - PLAYER_H,
    playerVY: 0,
    onGround: true,
    coyoteTimer: 0,
    jumpHeld: false,
    jumpHeldTime: 0,
    jumpQueued: false,
    leftHeld: false,
    rightHeld: false,
    bigMario: false,
    firepower: false,
    starTimer: 0,
    invincTimer: 0,
    fireballs: [],
    lastFireball: 0,
    worldX: 0,
    platforms: [{ x: 0, y: GROUND_Y, w: W * 3, h: H - GROUND_Y }],
    enemies: [],
    pipes: [],
    coins: [],
    qblocks: [],
    particles: [],
    spawnEdge: W * 3,
    score: 0,
    coinsCollected: 0,
    lives: 3,
    alive: true,
    started: false,
    frame: 0,
    stompChain: 0,
    aiDisabled: false,
    bestSession: 0,
  };
}

// ─── Level Generation ─────────────────────────────────────────────────────────
// Every chunk ALWAYS extends the ground first, then stacks features on top.
function spawnChunk(gs: GS) {
  const x = gs.spawnEdge;
  const difficulty = Math.min(1, gs.score / 3000);
  const r = Math.random();

  if (r < 0.15) {
    // Plain recovery stretch — just ground, maybe a few coins
    const w = 300 + Math.random() * 100;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const cCount = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < cCount; i++)
      gs.coins.push({ x: x + 40 + i * 36, y: GROUND_Y - 52, collected: false });
    gs.spawnEdge = x + w;

  } else if (r < 0.30) {
    // Coin arc — classic Mario 5-coin row at jump height
    const w = 380;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const coinCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < coinCount; i++)
      gs.coins.push({ x: x + 50 + i * 30, y: GROUND_Y - 65, collected: false });
    gs.spawnEdge = x + w;

  } else if (r < 0.45) {
    // Pipe(s) — 1–3 green pipes of varied height
    const w = 420;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const pipeCount = 1 + Math.floor(Math.random() * (difficulty > 0.4 ? 3 : 2));
    for (let i = 0; i < pipeCount; i++) {
      const ph = 28 + Math.random() * 32;
      gs.pipes.push({ x: x + 60 + i * 90, y: GROUND_Y - ph, w: 30, h: ph });
    }
    gs.spawnEdge = x + w;

  } else if (r < 0.60) {
    // Goombas — 1–3 enemies, with coins above them
    const w = 400;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const eCount = 1 + Math.floor(Math.random() * 2 + difficulty * 1.5);
    for (let i = 0; i < Math.min(eCount, 3); i++) {
      const ex = x + 70 + i * 100;
      gs.enemies.push({ x: ex, y: GROUND_Y - 24, w: 22, h: 24, vx: -(0.9 + difficulty * 0.6), alive: true, flat: false });
      gs.coins.push({ x: ex + 11, y: GROUND_Y - 62, collected: false });
    }
    gs.spawnEdge = x + w;

  } else if (r < 0.72) {
    // ? blocks — 1–3 floating blocks with items, coin arcs below
    const w = 380;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const bCount = 1 + Math.floor(Math.random() * 3);
    const items: QBlock['item'][] = ['coin', 'coin', 'coin', 'mushroom', 'fireball', 'star'];
    for (let i = 0; i < bCount; i++) {
      const bx = x + 60 + i * 90;
      gs.qblocks.push({ x: bx, y: GROUND_Y - 80, used: false, hitAnim: 0, item: items[Math.floor(Math.random() * items.length)] });
      // Coin arc in front of the block
      for (let j = 0; j < 3; j++)
        gs.coins.push({ x: bx + 20 + j * 28, y: GROUND_Y - 52, collected: false });
    }
    gs.spawnEdge = x + w;

  } else if (r < 0.84) {
    // Floating platform section — elevated platform with coins/? block on top
    const w = 400;
    gs.platforms.push({ x, y: GROUND_Y, w, h: H - GROUND_Y });
    const platY = GROUND_Y - 75 - Math.random() * 20;
    const platW = 80 + Math.random() * 60;
    gs.platforms.push({ x: x + 100, y: platY, w: platW, h: 14 });
    for (let i = 0; i < 3; i++)
      gs.coins.push({ x: x + 115 + i * 24, y: platY - 28, collected: false });
    if (Math.random() < 0.5) {
      const items: QBlock['item'][] = ['mushroom', 'coin', 'fireball'];
      gs.qblocks.push({ x: x + 180, y: platY - 30, used: false, hitAnim: 0, item: items[Math.floor(Math.random() * items.length)] });
    }
    gs.spawnEdge = x + w;

  } else {
    // Gap — short pit, always preceded by enough ground to jump from and safe landing
    const runupW = 100 + Math.random() * 40;
    const gapW = 40 + Math.random() * 28 + difficulty * 20;
    const landW = 180 + Math.random() * 60;
    // Runup ground
    gs.platforms.push({ x, y: GROUND_Y, w: runupW, h: H - GROUND_Y });
    // Landing ground
    gs.platforms.push({ x: x + runupW + gapW, y: GROUND_Y, w: landW, h: H - GROUND_Y });
    // Optional safety platform above the gap
    if (Math.random() < 0.6) {
      gs.platforms.push({ x: x + runupW + gapW / 2 - 24, y: GROUND_Y - 68, w: 48, h: 12 });
    }
    // Coins on the landing
    for (let i = 0; i < 3; i++)
      gs.coins.push({ x: x + runupW + gapW + 20 + i * 30, y: GROUND_Y - 52, collected: false });
    gs.spawnEdge = x + runupW + gapW + landW;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw - 3 && ax + aw > bx + 3 && ay < by + bh - 3 && ay + ah > by + 3;
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────
function drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx - rx * 0.55, cy + ry * 0.35, rx * 0.65, ry * 0.75, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + rx * 0.55, cy + ry * 0.35, rx * 0.65, ry * 0.75, 0, 0, Math.PI * 2); ctx.fill();
}

// ─── Component ───────────────────────────────────────────────────────────────
export function EndlessRunner() {
  const { recordGame, bestScore, navigate, state } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, getActionWeight, getTraitValue, recordPlayerAction } = useAIDemo('runner');
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
    if (now - gs.lastFireball < 380) return;
    gs.lastFireball = now;
    const wx = gs.playerX + gs.worldX;
    gs.fireballs.push({ x: wx + PLAYER_W + 2, y: gs.playerY + PLAYER_H / 2, vx: 11, vy: -3 });
    if (showParticlesRef.current) {
      for (let i = 0; i < 5; i++)
        gs.particles.push({ x: wx + PLAYER_W, y: gs.playerY + PLAYER_H / 2, vx: 4 + Math.random() * 4, vy: (Math.random() - 0.5) * 3, color: i % 2 ? '#ff6600' : '#ffcc00', life: 0.4 });
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

  // ── takeDamage: shield layers in Mario order ────────────────────────────────
  const takeDamage = useCallback((gs: GS) => {
    if (gs.invincTimer > 0 || gs.starTimer > 0) return;

    if (gs.firepower) {
      gs.firepower = false;
      gs.bigMario = true; // fire → big (same as SMB)
      gs.invincTimer = 1.8;
      return;
    }
    if (gs.bigMario) {
      gs.bigMario = false;
      gs.invincTimer = 1.8;
      if (showParticlesRef.current) {
        for (let i = 0; i < 8; i++)
          gs.particles.push({ x: gs.playerX + gs.worldX + PLAYER_W / 2, y: gs.playerY + PLAYER_H / 2, vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 3, color: i % 2 ? '#e52222' : '#f5c48a', life: 0.5 });
      }
      return;
    }
    // Small Mario — lose a life
    gs.lives -= 1;
    gs.stompChain = 0;
    gs.invincTimer = 2.2;
    if (gs.lives <= 0) {
      sfxRef.current('die');
      finishRun(gs);
      return;
    }
    gs.playerY = GROUND_Y - PLAYER_H;
    gs.playerVY = 0;
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
    gs.rightHeld = true;

    const px = gs.playerX + gs.worldX;
    const lookahead = Math.max(100, (isAdaptive ? 18 + getTraitValue('precision') * 12 : 22) * 3 + 60);

    let shouldJump = false;
    for (const pipe of gs.pipes) {
      if (pipe.x > px && pipe.x < px + lookahead) { shouldJump = true; break; }
    }
    if (!shouldJump) {
      for (const e of gs.enemies) {
        if (!e.alive || e.flat) continue;
        if (e.x > px && e.x < px + lookahead && Math.abs(e.y - gs.playerY) < 40) { shouldJump = true; break; }
      }
    }
    // Jump over gaps
    if (!shouldJump) {
      let hasPlatform = false;
      for (const p of gs.platforms) {
        if (p.x < px + 80 && p.x + p.w > px + 16 && p.y >= GROUND_Y - 2) { hasPlatform = true; break; }
      }
      if (!hasPlatform) shouldJump = true;
    }
    gs.jumpQueued = shouldJump && (gs.onGround || gs.coyoteTimer > 0);

    if (gs.firepower) {
      for (const e of gs.enemies) {
        if (!e.alive || e.flat) continue;
        if (e.x > px && e.x < px + 250) { shootFireball(); break; }
      }
    }
  }, [getTraitValue, isAdaptive, shootFireball]);

  // ── Draw ─────────────────────────────────────────────────────────────────────
  const draw = useCallback((ctx: CanvasRenderingContext2D, gs: GS, ts: number) => {
    // Sky
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, W, H);

    // Clouds (parallax)
    const cloudOff = (gs.worldX * 0.14) % (W + 120);
    const clouds = [{ ox: 60, oy: 38, rx: 32, ry: 16 }, { ox: 210, oy: 26, rx: 24, ry: 12 }, { ox: 360, oy: 50, rx: 28, ry: 14 }, { ox: 500, oy: 34, rx: 36, ry: 18 }];
    clouds.forEach(({ ox, oy, rx, ry }) => {
      const cx = ((ox - cloudOff % (W + 120) + W + 120) % (W + 120)) - 60;
      drawCloud(ctx, cx, oy, rx, ry);
    });

    const camX = -gs.worldX;
    ctx.save();
    ctx.translate(camX, 0);

    // Ground / platforms
    gs.platforms.forEach(p => {
      if (p.x + p.w < gs.worldX - 50 || p.x > gs.worldX + W + 50) return;
      if (p.h > 20) {
        // Ground brick
        ctx.fillStyle = '#8b5e3c'; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = '#6b4020'; ctx.lineWidth = 1;
        const bH = 12; const bW = 24;
        for (let row = 0; row * bH < p.h; row++) {
          const offX = row % 2 === 0 ? 0 : bW / 2;
          for (let col = -1; col * bW < p.w + bW; col++) ctx.strokeRect(p.x + col * bW + offX, p.y + row * bH, bW, bH);
        }
        ctx.fillStyle = '#4fc940'; ctx.fillRect(p.x, p.y, p.w, 8);
        ctx.fillStyle = '#3ab830'; ctx.fillRect(p.x, p.y + 8, p.w, 2);
      } else {
        // Floating brick platform
        ctx.fillStyle = '#c84b11'; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = '#8b5e3c'; ctx.lineWidth = 1.5;
        const bW = 14;
        for (let col = 0; col * bW < p.w; col++) ctx.strokeRect(p.x + col * bW, p.y, bW, p.h);
        ctx.fillStyle = '#e06020'; ctx.fillRect(p.x, p.y, p.w, 3);
      }
    });

    // Pipes
    gs.pipes.forEach(pipe => {
      if (pipe.x + pipe.w < gs.worldX - 20 || pipe.x > gs.worldX + W + 20) return;
      const capExtra = 4; const capH = 8;
      ctx.fillStyle = '#2e8b2e'; ctx.fillRect(pipe.x + 2, pipe.y + capH, pipe.w - 4, pipe.h - capH);
      ctx.fillStyle = '#3cb33c'; ctx.fillRect(pipe.x + 4, pipe.y + capH, 4, pipe.h - capH);
      ctx.fillStyle = '#2e8b2e'; ctx.fillRect(pipe.x - capExtra, pipe.y, pipe.w + capExtra * 2, capH);
      ctx.fillStyle = '#3cb33c'; ctx.fillRect(pipe.x - capExtra + 2, pipe.y, 4, capH);
      ctx.strokeStyle = '#1a5c1a'; ctx.lineWidth = 1;
      ctx.strokeRect(pipe.x + 2, pipe.y + capH, pipe.w - 4, pipe.h - capH);
      ctx.strokeRect(pipe.x - capExtra, pipe.y, pipe.w + capExtra * 2, capH);
    });

    // Coins
    gs.coins.forEach(coin => {
      if (coin.collected) return;
      const pulse = 0.82 + 0.18 * Math.sin(ts / 180 + coin.x * 0.05);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(coin.x, coin.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e6a800'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(coin.x, coin.y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(coin.x - 1.5, coin.y - 2, 2, 1.2, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });

    // ? blocks
    gs.qblocks.forEach(b => {
      const bounce = b.hitAnim > 0 ? -Math.sin(b.hitAnim * Math.PI * 5) * 8 : Math.sin(ts / 290 + b.x * 0.1) * 2;
      const bx = b.x; const by = b.y;
      ctx.fillStyle = b.used ? '#6b4500' : '#e8a000'; ctx.fillRect(bx, by + bounce, 20, 20);
      ctx.fillStyle = b.used ? '#7a5200' : '#ffc800'; ctx.fillRect(bx, by + bounce, 20, 3); ctx.fillRect(bx, by + bounce, 3, 20);
      ctx.fillStyle = b.used ? '#3a2200' : '#a06000'; ctx.fillRect(bx, by + bounce + 17, 20, 3); ctx.fillRect(bx + 17, by + bounce, 3, 20);
      if (!b.used) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
        ctx.fillText('?', bx + 10, by + bounce + 14); ctx.textAlign = 'left';
      }
    });

    // Enemies — Goomba style
    gs.enemies.forEach(e => {
      if (!e.alive) return;
      if (e.flat) {
        // Squished Goomba
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(e.x, e.y + e.h - 6, e.w, 6);
        ctx.fillStyle = '#c47a3a'; ctx.fillRect(e.x + 2, e.y + e.h - 5, e.w - 4, 3);
        return;
      }
      const { x: ex, y: ey, w: ew, h: eh } = e;
      ctx.fillStyle = '#8b4513';
      ctx.beginPath(); ctx.arc(ex + ew / 2, ey + eh * 0.42, ew * 0.5, Math.PI, 0);
      ctx.rect(ex, ey + eh * 0.42, ew, eh * 0.58); ctx.fill();
      ctx.fillStyle = '#c47a3a'; ctx.fillRect(ex + ew * 0.2, ey + eh * 0.48, ew * 0.6, eh * 0.25);
      ctx.strokeStyle = '#2a0a00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ex + 3, ey + eh * 0.28); ctx.lineTo(ex + ew * 0.42, ey + eh * 0.36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + ew - 3, ey + eh * 0.28); ctx.lineTo(ex + ew * 0.58, ey + eh * 0.36); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(ex + 3, ey + eh * 0.33, 5, 5); ctx.fillRect(ex + ew - 8, ey + eh * 0.33, 5, 5);
      ctx.fillStyle = '#111'; ctx.fillRect(ex + 4, ey + eh * 0.36, 3, 3); ctx.fillRect(ex + ew - 7, ey + eh * 0.36, 3, 3);
      const bob = Math.sin(gs.frame * 0.22 + e.x * 0.1) * 2;
      ctx.fillStyle = '#3a1a00';
      ctx.fillRect(ex + 1, ey + eh - 5 + bob, 8, 4); ctx.fillRect(ex + ew - 9, ey + eh - 5 - bob, 8, 4);
    });

    // Fireballs
    gs.fireballs.forEach(fb => {
      if (fb.x < gs.worldX - 20 || fb.x > gs.worldX + W + 20) return;
      ctx.save(); ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(255,120,0,0.3)'; ctx.beginPath(); ctx.arc(fb.x + 5, fb.y + 5, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6600'; ctx.beginPath(); ctx.arc(fb.x + 5, fb.y + 5, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffee44'; ctx.beginPath(); ctx.arc(fb.x + 4, fb.y + 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // ── Player ──────────────────────────────────────────────────────────────────
    const px = gs.playerX + gs.worldX;
    const ph = gs.bigMario || gs.firepower ? PLAYER_H_BIG : PLAYER_H;
    const pw = gs.bigMario || gs.firepower ? PLAYER_W + 4 : PLAYER_W;
    const py = gs.playerY;

    // Star glow
    if (gs.starTimer > 0) {
      const t = ts / 80;
      ctx.save(); ctx.globalAlpha = 0.6;
      ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 24;
      ctx.fillStyle = `hsl(${Math.floor(t * 60) % 360},100%,60%)`;
      ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, pw, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Fire aura
    if (gs.firepower) {
      ctx.save(); ctx.globalAlpha = 0.3 + 0.2 * Math.sin(ts / 80);
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#ff6600'; ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, pw, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = gs.invincTimer > 0 ? (Math.floor(ts / 80) % 2 === 0 ? 0.25 : 1) : 1;

    // Scale Mario body by power state
    const scale = (gs.bigMario || gs.firepower) ? 1.4 : 1;
    const capColor = gs.firepower ? '#ffffff' : '#e52222';
    // Cap
    ctx.fillStyle = capColor; ctx.fillRect(px + 1, py, pw - 2, Math.round(7 * scale));
    ctx.fillRect(px - 1, py + Math.round(5 * scale), pw + 2, Math.round(4 * scale));
    // Face
    ctx.fillStyle = '#f5c48a'; ctx.fillRect(px + 2, py + Math.round(8 * scale), pw - 4, Math.round(9 * scale));
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(px + 4, py + Math.round(10 * scale), Math.round(3 * scale), Math.round(3 * scale));
    ctx.fillRect(px + pw - Math.round(7 * scale), py + Math.round(10 * scale), Math.round(3 * scale), Math.round(3 * scale));
    ctx.fillStyle = '#3a1a00'; ctx.fillRect(px + 3, py + Math.round(14 * scale), pw - 6, Math.round(2 * scale));
    // Shirt
    const shirtColor = gs.firepower ? '#ff6600' : '#e52222';
    ctx.fillStyle = shirtColor; ctx.fillRect(px + 1, py + Math.round(17 * scale), pw - 2, Math.round(7 * scale));
    ctx.fillStyle = '#3344cc'; ctx.fillRect(px, py + Math.round(21 * scale), pw, Math.round(6 * scale));
    ctx.fillStyle = '#2233aa';
    ctx.fillRect(px + 3, py + Math.round(17 * scale), Math.round(4 * scale), Math.round(5 * scale));
    ctx.fillRect(px + pw - Math.round(7 * scale), py + Math.round(17 * scale), Math.round(4 * scale), Math.round(5 * scale));
    // Legs
    const moving = gs.leftHeld || gs.rightHeld;
    const legPhase = moving && gs.onGround ? Math.sin(gs.frame * 0.28) : 0;
    ctx.fillStyle = '#3344cc';
    ctx.fillRect(px + 2, py + ph - Math.round(9 * scale), Math.round(7 * scale), Math.round(9 * scale) + Math.round(legPhase * 3));
    ctx.fillRect(px + pw - Math.round(9 * scale), py + ph - Math.round(9 * scale), Math.round(7 * scale), Math.round(9 * scale) - Math.round(legPhase * 3));
    ctx.fillStyle = '#5c2e00';
    ctx.fillRect(px + 1, py + ph - Math.round(2 * scale), Math.round(9 * scale), Math.round(3 * scale));
    ctx.fillRect(px + pw - Math.round(10 * scale), py + ph - Math.round(2 * scale), Math.round(9 * scale), Math.round(3 * scale));

    ctx.globalAlpha = 1;
    ctx.restore();

    // Particles
    gs.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x + camX, p.y, 4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, 28);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffd700'; ctx.fillText(`SCORE: ${gs.score}`, 6, 19);
    ctx.fillStyle = '#ffd700'; ctx.fillText(`COINS: ${gs.coinsCollected}`, 140, 19);
    ctx.fillStyle = '#ff4444'; ctx.fillText(`LIVES: ${gs.lives}`, W - 90, 19);

    if (gs.starTimer > 0) { ctx.fillStyle = '#ffff00'; ctx.fillText('STAR!', W - 240, 19); }
    else if (gs.firepower) { ctx.fillStyle = '#ff6600'; ctx.fillText('FIRE', W - 200, 19); }
    else if (gs.bigMario) { ctx.fillStyle = '#ffffff'; ctx.fillText('BIG', W - 200, 19); }

    if (aiEnabledRef.current && !gs.aiDisabled && gs.alive) {
      ctx.fillStyle = 'rgba(0,200,255,0.85)'; ctx.fillRect(W / 2 - 20, 4, 40, 18);
      ctx.fillStyle = '#000'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('AI', W / 2, 17); ctx.textAlign = 'left';
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
      const dt = dtMs / 1000;

      // Timers
      if (gs.starTimer > 0) gs.starTimer -= dt;
      if (gs.invincTimer > 0) gs.invincTimer -= dt;
      if (gs.coyoteTimer > 0) gs.coyoteTimer -= dt;

      // Horizontal movement (instant, Mario-style)
      if (gs.leftHeld) gs.playerX = Math.max(PLAYER_X_MIN, gs.playerX - MOVE_SPEED);
      if (gs.rightHeld) gs.playerX += MOVE_SPEED;

      // Jump
      const ph = gs.bigMario || gs.firepower ? PLAYER_H_BIG : PLAYER_H;
      const canJump = gs.onGround || gs.coyoteTimer > 0;
      if (gs.jumpQueued && canJump) {
        gs.playerVY = JUMP_POWER;
        gs.onGround = false; gs.coyoteTimer = 0; gs.jumpHeldTime = 0;
        sfxRef.current('jump');
      }
      gs.jumpQueued = false;

      // Variable jump height
      if (gs.jumpHeld && gs.playerVY < 0) {
        gs.jumpHeldTime += dt;
        gs.playerVY += gs.jumpHeldTime < 0.18 ? GRAVITY * 0.38 : GRAVITY;
      } else {
        gs.playerVY += GRAVITY;
      }

      // Apply gravity, clamp fall speed
      gs.playerVY = Math.min(gs.playerVY, 14);
      gs.playerY += gs.playerVY;

      const wasOnGround = gs.onGround;
      gs.onGround = false;

      // Platform collision
      for (const p of gs.platforms) {
        const wx = gs.playerX + gs.worldX;
        if (wx + PLAYER_W > p.x && wx < p.x + p.w &&
            gs.playerY + ph > p.y && gs.playerY + ph < p.y + 20 && gs.playerVY >= 0) {
          gs.playerY = p.y - ph;
          gs.playerVY = 0; gs.onGround = true;
          break;
        }
      }

      if (wasOnGround && !gs.onGround && gs.playerVY >= 0) gs.coyoteTimer = Math.max(gs.coyoteTimer, 0.11);
      if (gs.onGround) { gs.coyoteTimer = 0; gs.jumpHeldTime = 0; }

      // Camera scroll right only
      if (gs.playerX > CAMERA_RIGHT) {
        const dx = gs.playerX - CAMERA_RIGHT;
        gs.worldX += dx;
        gs.playerX = CAMERA_RIGHT;
        gs.score += Math.floor(dx);
      }

      // Spawn more terrain
      while (gs.spawnEdge < gs.worldX + W + 600) spawnChunk(gs);

      // Cull old objects
      const cullX = gs.worldX - 200;
      gs.platforms = gs.platforms.filter(p => p.x + p.w > cullX);
      gs.pipes = gs.pipes.filter(p => p.x + p.w > cullX);
      gs.coins = gs.coins.filter(c => c.x > cullX);
      gs.enemies = gs.enemies.filter(e => e.x + e.w > cullX);
      gs.qblocks = gs.qblocks.filter(b => b.x > cullX);
      gs.fireballs = gs.fireballs.filter(f => f.x < gs.worldX + W + 50);

      // Enemy AI
      for (const e of gs.enemies) {
        if (!e.alive) continue;
        e.x += e.vx;
        // Turn at platform edges
        let onPlat = false;
        for (const p of gs.platforms) {
          if (e.x + e.w > p.x && e.x < p.x + p.w && e.y + e.h >= p.y - 1) { onPlat = true; break; }
        }
        if (!onPlat) e.vx = -e.vx;
        // Turn at pipes
        for (const pipe of gs.pipes) {
          if (rectsOverlap(e.x, e.y, e.w, e.h, pipe.x - 2, pipe.y, pipe.w + 4, pipe.h)) { e.vx = -e.vx; break; }
        }
      }

      // Fireballs
      for (let fi = gs.fireballs.length - 1; fi >= 0; fi--) {
        const fb = gs.fireballs[fi];
        fb.x += fb.vx;
        fb.vy += 0.4; fb.y += fb.vy;
        // Bounce on ground
        for (const p of gs.platforms) {
          if (fb.x > p.x && fb.x < p.x + p.w && fb.y + 8 > p.y && fb.y < p.y + 8) {
            fb.vy = -Math.abs(fb.vy) * 0.6; fb.y = p.y - 8; break;
          }
        }
        // Hit enemy
        let hit = false;
        for (const e of gs.enemies) {
          if (!e.alive || e.flat) continue;
          if (fb.x < e.x + e.w && fb.x + 8 > e.x && fb.y < e.y + e.h && fb.y + 8 > e.y) {
            e.alive = false; gs.score += 200; hit = true;
            if (showParticlesRef.current) {
              for (let pi = 0; pi < 6; pi++)
                gs.particles.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 4, color: pi % 2 ? '#ff6600' : '#ffcc00', life: 0.6 });
            }
            break;
          }
        }
        if (hit) { gs.fireballs.splice(fi, 1); continue; }
      }

      // ? block hit from below (player jumps up into it)
      const wx = gs.playerX + gs.worldX;
      for (const b of gs.qblocks) {
        if (b.used || b.hitAnim > 0) continue;
        if (gs.playerVY < 0 &&
            wx + PLAYER_W > b.x + 1 && wx < b.x + 19 &&
            gs.playerY <= b.y + 20 && gs.playerY > b.y - 2) {
          b.used = true; b.hitAnim = 0.4;
          gs.playerVY = Math.max(0, gs.playerVY + 3);
          // Spawn item
          if (b.item === 'coin') {
            gs.coinsCollected++; gs.score += 10;
          } else if (b.item === 'mushroom') {
            if (!gs.bigMario && !gs.firepower) gs.bigMario = true;
          } else if (b.item === 'fireball') {
            gs.firepower = true; gs.bigMario = true;
          } else if (b.item === 'star') {
            gs.starTimer = 10;
          }
          if (showParticlesRef.current) {
            for (let ci = 0; ci < 6; ci++)
              gs.particles.push({ x: b.x + 10, y: b.y - 10, vx: (Math.random() - 0.5) * 3, vy: -3 - Math.random() * 2, color: '#ffd700', life: 0.6 });
          }
          sfxRef.current('jump');
        }
        if (b.hitAnim > 0) b.hitAnim = Math.max(0, b.hitAnim - dt);
      }

      // Coin collection
      for (const coin of gs.coins) {
        if (!coin.collected &&
            Math.hypot(coin.x - (wx + PLAYER_W / 2), coin.y - (gs.playerY + ph / 2)) < 26) {
          coin.collected = true;
          gs.coinsCollected++; gs.score += 10;
          if (showParticlesRef.current)
            gs.particles.push({ x: coin.x, y: coin.y, vx: 0, vy: -3, color: '#ffd700', life: 0.45 });
        }
      }

      // Pipe collision (treat as wall)
      for (const pipe of gs.pipes) {
        if (rectsOverlap(wx, gs.playerY, PLAYER_W, ph, pipe.x - 1, pipe.y, pipe.w + 2, pipe.h)) {
          takeDamage(gs);
          break;
        }
      }

      // Enemy collision
      const playerRect = { x: wx, y: gs.playerY, w: PLAYER_W, h: ph };
      for (const e of gs.enemies) {
        if (!e.alive || e.flat) continue;
        if (rectsOverlap(playerRect.x, playerRect.y, playerRect.w, playerRect.h, e.x, e.y, e.w, e.h)) {
          if (gs.starTimer > 0) {
            // Star kills enemy
            e.alive = false; gs.score += 200;
          } else if (gs.playerVY > 0 && gs.playerY + ph < e.y + e.h * 0.55) {
            // Stomp
            e.flat = true;
            gs.playerVY = -7;
            gs.stompChain++;
            gs.score += Math.min(gs.stompChain, 5) * 100;
            sfxRef.current('jump');
            setTimeout(() => { e.alive = false; }, 400);
            if (showParticlesRef.current) {
              for (let si = 0; si < 6; si++)
                gs.particles.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 2, color: '#ffd700', life: 0.45 });
            }
          } else {
            takeDamage(gs);
          }
          break;
        }
      }

      // Fell into pit
      if (gs.playerY > H + 40) {
        gs.bigMario = false; gs.firepower = false;
        takeDamage(gs);
      }

      // Particles
      gs.particles = gs.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.04;
        return p.life > 0;
      });

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
      if (['Space', 'ArrowUp', 'KeyW', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyF'].includes(e.code)) e.preventDefault();
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
          hint="◀ ▶ to move · JUMP to hop (hold for height) · collect ? blocks then FIRE"
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
          eyebrow={phase === 'ready' ? 'Touch Run' : 'Run Ended'}
          title={phase === 'ready' ? 'Jump, stomp, collect coins!' : 'Try again?'}
          subtitle={phase === 'ready'
            ? 'Run right, stomp Goombas, hit ? blocks from below for powerups!'
            : 'Stomp Goombas, hit ? blocks from below, get Fire Flower to shoot!'}
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
