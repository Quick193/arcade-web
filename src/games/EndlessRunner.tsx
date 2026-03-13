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

const W = 480;
const H = 320;
const GRAVITY = 0.5;
const JUMP_POWER = -12.2;
const GROUND_Y = 260;
const PLAYER_W = 24;
const PLAYER_H = 32;
const PLAYER_X_DEFAULT = 60;
const PLAYER_X_MIN = 16;
const PLAYER_X_MAX = W / 2;   // can't run too far ahead
const PLAYER_MOVE_SPEED = 3.2;

interface Platform { x: number; y: number; w: number; h: number; }
interface Enemy { x: number; y: number; w: number; h: number; vx: number; alive: boolean; }
interface Spike { x: number; y: number; w: number; h: number; }
interface Coin { x: number; y: number; collected: boolean; }
interface Powerup { x: number; y: number; type: 'shield' | 'score2x' | 'jump' | 'fireball'; collected: boolean; hitAnim: number; }
interface FireBall { x: number; y: number; vx: number; phase: number; }
interface Particle { x: number; y: number; vx: number; vy: number; color: string; life: number; size: number; }

interface GS {
  playerX: number;        // screen-space X of player (camera-relative)
  playerY: number;
  playerVY: number;
  onGround: boolean;
  leftHeld: boolean;
  rightHeld: boolean;
  platforms: Platform[];
  enemies: Enemy[];
  spikes: Spike[];
  coins: Coin[];
  powerups: Powerup[];
  fireballs: FireBall[];
  fireballCount: number;
  lastFireball: number;
  particles: Particle[];
  worldX: number;
  score: number;
  coinsCollected: number;
  alive: boolean;
  started: boolean;
  frame: number;
  speed: number;
  shieldTimer: number;
  scoreMultTimer: number;
  jumpBoostTimer: number;
  fireballTimer: number;  // seconds remaining for fireball power
  lives: number;
  spawnTimer: number;
  aiDisabled: boolean;
  bestSession: number;
  jumpQueued: boolean;
  jumpHeld: boolean;
  jumpHeldTime: number;
  invincTimer: number;
  coyoteTimer: number;
  stompChain: number;
  stompChainTimer: number;
}

function initGs(): GS {
  return {
    playerX: PLAYER_X_DEFAULT,
    playerY: GROUND_Y - PLAYER_H,
    playerVY: 0,
    onGround: true,
    leftHeld: false,
    rightHeld: false,
    platforms: [{ x: 0, y: GROUND_Y, w: W * 4, h: H - GROUND_Y }],
    enemies: [],
    spikes: [],
    coins: [],
    powerups: [],
    fireballs: [],
    fireballCount: 0,
    lastFireball: 0,
    particles: [],
    worldX: 0,
    score: 0,
    coinsCollected: 0,
    alive: true,
    started: false,
    frame: 0,
    speed: 2.6,
    shieldTimer: 0,
    scoreMultTimer: 0,
    jumpBoostTimer: 0,
    fireballTimer: 0,
    lives: 3,
    spawnTimer: 210,
    aiDisabled: false,
    bestSession: 0,
    jumpQueued: false,
    jumpHeld: false,
    jumpHeldTime: 0,
    invincTimer: 0,
    coyoteTimer: 0,
    stompChain: 0,
    stompChainTimer: 0,
  };
}

function spawnChunk(gs: GS) {
  const rightEdge = gs.worldX + W + 200;
  const rand = Math.random();

  if (rand < 0.25) {
    const gapW = 35 + Math.random() * 35;
    const platX = rightEdge + gapW;
    const platW = 140 + Math.random() * 80;
    gs.platforms.push({ x: platX, y: GROUND_Y, w: platW, h: H - GROUND_Y });
    if (Math.random() < 0.4) {
      gs.platforms.push({ x: platX + 20, y: GROUND_Y - 70 - Math.random() * 30, w: 80, h: 16 });
    }
    gs.coins.push({ x: platX + 20, y: GROUND_Y - 30, collected: false });
  } else if (rand < 0.45) {
    const count = 1 + Math.floor(gs.score / 400);
    for (let index = 0; index < Math.min(count, 2); index += 1) {
      gs.enemies.push({ x: rightEdge + 80 + index * 100, y: GROUND_Y - 28, w: 24, h: 28, vx: -1.2, alive: true });
    }
    gs.platforms.push({ x: rightEdge, y: GROUND_Y, w: 350, h: H - GROUND_Y });
  } else if (rand < 0.65) {
    const count = 1 + Math.floor(Math.random() * 2);
    for (let index = 0; index < count; index += 1) {
      gs.spikes.push({ x: rightEdge + 60 + index * 50, y: GROUND_Y - 20, w: 22, h: 20 });
    }
    gs.platforms.push({ x: rightEdge, y: GROUND_Y, w: 400, h: H - GROUND_Y });
  } else {
    for (let index = 0; index < 5; index += 1) {
      gs.coins.push({ x: rightEdge + 30 + index * 40, y: GROUND_Y - 60 - Math.sin(index) * 30, collected: false });
    }
    if (Math.random() < 0.5) {
      const types: Powerup['type'][] = ['shield', 'score2x', 'jump', 'fireball'];
      gs.powerups.push({ x: rightEdge + 120, y: GROUND_Y - 80, type: types[Math.floor(Math.random() * 4)], collected: false, hitAnim: 0 });
    }
    gs.platforms.push({ x: rightEdge, y: GROUND_Y, w: 350, h: H - GROUND_Y });
  }
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w - 4 && a.x + a.w > b.x + 4 && a.y < b.y + b.h - 4 && a.y + a.h > b.y + 4;
}

export function EndlessRunner() {
  const { recordGame, checkAchievements, bestScore, navigate } = useApp();
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
    if (!gs.started) {
      gs.started = true;
      setPhase('playing');
    }
    gs.jumpQueued = true;
    gs.jumpHeld = true;
    gs.jumpHeldTime = 0;
  }, []);

  const releaseJump = useCallback(() => {
    gsRef.current.jumpHeld = false;
  }, []);

  const shootFireball = useCallback(() => {
    const gs = gsRef.current;
    if (!gs.alive || !gs.started) return;
    if (gs.fireballCount <= 0) return;
    const now = performance.now();
    if (now - gs.lastFireball < 350) return; // 350ms cooldown
    gs.lastFireball = now;
    gs.fireballCount -= 1;
    const worldX = gs.playerX + gs.worldX;
    gs.fireballs.push({ x: worldX + PLAYER_W + 4, y: gs.playerY + PLAYER_H / 2 - 5, vx: gs.speed + 12, phase: 0 });
    for (let i = 0; i < 6; i += 1) {
      gs.particles.push({ x: worldX + PLAYER_W, y: gs.playerY + PLAYER_H / 2, vx: 5 + Math.random() * 4, vy: (Math.random() - 0.5) * 3, color: i % 2 === 0 ? '#ff6600' : '#ffcc00', life: 0.4, size: 4 });
    }
    recordPlayerAction('shoot', { aggression: 0.8, precision: 0.6 });
  }, [recordPlayerAction]);

  const finishRun = useCallback((gs: GS) => {
    if (!gs.alive) return;
    gs.alive = false;
    recordGame('runner', false, gs.score, gs.frame / 60);
    checkAchievements('runner', { score: gs.score, duration: gs.frame / 60 });
    setPhase('gameover');
    setDisplayScore(gs.score);
  }, [checkAchievements, recordGame]);

  const takeDamage = useCallback((gs: GS) => {
    if (gs.invincTimer > 0) return;
    if (gs.shieldTimer > 0) {
      gs.shieldTimer = 0;
      for (let index = 0; index < 10; index += 1) {
        gs.particles.push({ x: gs.playerX + gs.worldX + PLAYER_W / 2, y: gs.playerY + PLAYER_H / 2, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, color: '#4488ff', life: 0.5, size: 5 });
      }
      return;
    }
    gs.lives -= 1;
    gs.invincTimer = 2.0;
    gs.stompChain = 0;
    if (gs.lives <= 0) {
      sfxRef.current('die');
      for (let index = 0; index < 20; index += 1) {
        gs.particles.push({ x: gs.playerX + gs.worldX + PLAYER_W / 2, y: gs.playerY, vx: (Math.random() - 0.5) * 10, vy: -Math.random() * 8, color: '#ff4444', life: 1, size: 5 });
      }
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

  const aiDecide = useCallback((gs: GS) => {
    if (!aiEnabledRef.current || gs.aiDisabled || !gs.alive) return;
    if (!gs.started) { gs.started = true; setPhase('playing'); }

    const px = gs.playerX + gs.worldX;
    const lookAhead = gs.speed * (isAdaptive ? 18 + getTraitValue('precision') * 12 : 22) + px;
    let shouldJump = false;

    for (const spike of gs.spikes) {
      if (spike.x > px && spike.x < lookAhead && spike.y < gs.playerY + PLAYER_H + 5) { shouldJump = true; break; }
    }
    if (!shouldJump) {
      for (const enemy of gs.enemies) {
        if (!enemy.alive) continue;
        if (enemy.x > px && enemy.x < lookAhead && Math.abs(enemy.y - gs.playerY) < 40) { shouldJump = true; break; }
      }
    }

    let hasPlatformAhead = false;
    for (const platform of gs.platforms) {
      if (platform.x < px + 80 && platform.x + platform.w > px + 20 && platform.y >= GROUND_Y - 2) { hasPlatformAhead = true; break; }
    }
    if (!hasPlatformAhead) shouldJump = true;

    gs.jumpQueued = (shouldJump) && gs.onGround;

    // AI auto-fires fireball at nearby enemies
    if (gs.fireballCount > 0) {
      for (const enemy of gs.enemies) {
        if (!enemy.alive) continue;
        if (enemy.x > px && enemy.x < px + 200 && Math.abs(enemy.y - gs.playerY) < 40) {
          shootFireball();
          break;
        }
      }
    }
  }, [getTraitValue, isAdaptive, shootFireball]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, gs: GS, ts: number) => {
    // Background: Mario blue sky
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, W, H);

    // Scrolling clouds
    const cloudOffX = (gs.worldX * 0.15) % (W + 120);
    const cloudDefs = [
      { ox: 60, oy: 40, rx: 32, ry: 16 },
      { ox: 200, oy: 28, rx: 24, ry: 13 },
      { ox: 340, oy: 52, rx: 28, ry: 14 },
      { ox: 480, oy: 36, rx: 36, ry: 18 },
    ];
    ctx.fillStyle = '#ffffff';
    cloudDefs.forEach(({ ox, oy, rx, ry }) => {
      const cx = ((ox - cloudOffX % (W + 120) + W + 120) % (W + 120)) - 60;
      ctx.beginPath(); ctx.ellipse(cx, oy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx - rx * 0.55, oy + ry * 0.35, rx * 0.65, ry * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + rx * 0.55, oy + ry * 0.35, rx * 0.65, ry * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    });

    const camX = -gs.worldX;
    ctx.save();
    ctx.translate(camX, 0);

    // Platforms
    gs.platforms.forEach((platform) => {
      if (platform.x + platform.w < gs.worldX - 50 || platform.x > gs.worldX + W + 50) return;
      if (platform.h > 40) {
        ctx.fillStyle = '#8b5e3c';
        ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
        ctx.strokeStyle = '#6b4020'; ctx.lineWidth = 1;
        const brickH = 12; const brickW = 24;
        for (let row = 0; row * brickH < platform.h; row += 1) {
          const offsetX = (row % 2 === 0) ? 0 : brickW / 2;
          for (let col = -1; col * brickW < platform.w + brickW; col += 1) {
            ctx.strokeRect(platform.x + col * brickW + offsetX, platform.y + row * brickH, brickW, brickH);
          }
        }
        ctx.fillStyle = '#4fc940'; ctx.fillRect(platform.x, platform.y, platform.w, 8);
        ctx.fillStyle = '#3ab830'; ctx.fillRect(platform.x, platform.y + 8, platform.w, 2);
      } else {
        ctx.fillStyle = '#c84b11'; ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
        ctx.strokeStyle = '#8b5e3c'; ctx.lineWidth = 1.5;
        const bW = 16;
        for (let col = 0; col * bW < platform.w; col += 1) ctx.strokeRect(platform.x + col * bW, platform.y, bW, platform.h);
        ctx.fillStyle = '#e06020'; ctx.fillRect(platform.x, platform.y, platform.w, 3);
      }
    });

    // Spikes → Green Pipes
    gs.spikes.forEach((spike) => {
      const capH = Math.min(6, spike.h); const capExtra = 4;
      ctx.fillStyle = '#2e8b2e'; ctx.fillRect(spike.x + 2, spike.y + capH, spike.w - 4, spike.h - capH);
      ctx.fillStyle = '#3cb33c'; ctx.fillRect(spike.x + 4, spike.y + capH, 4, spike.h - capH);
      ctx.fillStyle = '#2e8b2e'; ctx.fillRect(spike.x - capExtra, spike.y, spike.w + capExtra * 2, capH);
      ctx.fillStyle = '#3cb33c'; ctx.fillRect(spike.x - capExtra + 2, spike.y, 4, capH);
      ctx.strokeStyle = '#1a5c1a'; ctx.lineWidth = 1;
      ctx.strokeRect(spike.x + 2, spike.y + capH, spike.w - 4, spike.h - capH);
      ctx.strokeRect(spike.x - capExtra, spike.y, spike.w + capExtra * 2, capH);
    });

    // Coins
    gs.coins.forEach((coin) => {
      if (coin.collected) return;
      const pulse = 0.85 + 0.15 * Math.sin(ts / 180 + coin.x * 0.05);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(coin.x, coin.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e6a800'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(coin.x, coin.y, 5.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(coin.x - 2, coin.y - 2, 2.5, 1.5, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Powerup ? blocks
    gs.powerups.forEach((powerup) => {
      if (powerup.collected && powerup.hitAnim <= 0) return;
      const bx = powerup.x - 10; const by = powerup.y - 10; const bSize = 20;
      const bounce = powerup.hitAnim > 0
        ? -Math.sin(powerup.hitAnim * Math.PI * 5) * 9
        : Math.sin(ts / 300 + powerup.x * 0.1) * 2;
      ctx.fillStyle = powerup.collected ? '#6b4500' : (powerup.type === 'fireball' ? '#cc2200' : '#e8a000');
      ctx.fillRect(bx, by + bounce, bSize, bSize);
      ctx.fillStyle = powerup.collected ? '#7a5200' : (powerup.type === 'fireball' ? '#ff4400' : '#ffc800');
      ctx.fillRect(bx, by + bounce, bSize, 3); ctx.fillRect(bx, by + bounce, 3, bSize);
      ctx.fillStyle = powerup.collected ? '#3a2200' : (powerup.type === 'fireball' ? '#881100' : '#a06000');
      ctx.fillRect(bx, by + bounce + bSize - 3, bSize, 3); ctx.fillRect(bx + bSize - 3, by + bounce, 3, bSize);
      if (!powerup.collected) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
        ctx.fillText(powerup.type === 'fireball' ? 'F' : '?', powerup.x, powerup.y + bounce + 5);
        ctx.textAlign = 'left';
      }
    });

    // Fireballs (world coords, drawn inside translate)
    gs.fireballs.forEach((fb) => {
      if (fb.x < gs.worldX - 20 || fb.x > gs.worldX + W + 20) return;
      ctx.save();
      const glow = '#ff6600';
      ctx.shadowColor = glow; ctx.shadowBlur = 18;
      // Outer glow
      ctx.fillStyle = 'rgba(255,120,0,0.35)';
      ctx.beginPath(); ctx.arc(fb.x + 5, fb.y + 5, 11, 0, Math.PI * 2); ctx.fill();
      // Main ball
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff6600';
      ctx.beginPath(); ctx.arc(fb.x + 5, fb.y + 5, 7, 0, Math.PI * 2); ctx.fill();
      // Core
      ctx.fillStyle = '#ffee44';
      ctx.beginPath(); ctx.arc(fb.x + 4, fb.y + 4, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Enemies: Goomba style
    gs.enemies.forEach((enemy) => {
      if (!enemy.alive) return;
      const ex = enemy.x; const ey = enemy.y; const ew = enemy.w; const eh = enemy.h;
      ctx.fillStyle = '#8b4513';
      ctx.beginPath(); ctx.arc(ex + ew / 2, ey + eh * 0.45, ew * 0.5, Math.PI, 0);
      ctx.rect(ex, ey + eh * 0.45, ew, eh * 0.55); ctx.fill();
      ctx.fillStyle = '#c47a3a'; ctx.fillRect(ex + ew * 0.2, ey + eh * 0.5, ew * 0.6, eh * 0.28);
      ctx.strokeStyle = '#2a0a00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex + 3, ey + eh * 0.3); ctx.lineTo(ex + ew * 0.42, ey + eh * 0.38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + ew - 3, ey + eh * 0.3); ctx.lineTo(ex + ew * 0.58, ey + eh * 0.38); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(ex + 4, ey + eh * 0.35, 5, 5); ctx.fillRect(ex + ew - 9, ey + eh * 0.35, 5, 5);
      ctx.fillStyle = '#111'; ctx.fillRect(ex + 5, ey + eh * 0.38, 3, 3); ctx.fillRect(ex + ew - 8, ey + eh * 0.38, 3, 3);
      const footBob = Math.sin(enemy.x * 0.2) * 2;
      ctx.fillStyle = '#3a1a00';
      ctx.fillRect(ex + 1, ey + eh - 4 + footBob, 8, 4); ctx.fillRect(ex + ew - 9, ey + eh - 4 - footBob, 8, 4);
    });

    // Player: Mario style (screen position = gs.playerX, world position = gs.playerX + gs.worldX)
    const px = gs.playerX + gs.worldX;

    if (gs.invincTimer > 0) ctx.globalAlpha = Math.floor(ts / 80) % 2 === 0 ? 0.25 : 1;

    if (gs.shieldTimer > 0) {
      const glowAlpha = 0.5 + 0.5 * Math.abs(Math.sin(ts / 100));
      ctx.globalAlpha = glowAlpha;
      const starGlow = ctx.createRadialGradient(px + PLAYER_W / 2, gs.playerY + PLAYER_H / 2, 4, px + PLAYER_W / 2, gs.playerY + PLAYER_H / 2, PLAYER_W + 6);
      starGlow.addColorStop(0, '#ffffa0'); starGlow.addColorStop(0.5, '#ffdd00'); starGlow.addColorStop(1, 'rgba(255,200,0,0)');
      ctx.fillStyle = starGlow;
      ctx.beginPath(); ctx.arc(px + PLAYER_W / 2, gs.playerY + PLAYER_H / 2, PLAYER_W + 6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Fireball aura when powered up
    if (gs.fireballCount > 0 || gs.fireballTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(ts / 80);
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 20;
      ctx.fillStyle = '#ff6600';
      ctx.beginPath(); ctx.arc(px + PLAYER_W / 2, gs.playerY + PLAYER_H / 2, PLAYER_W - 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = gs.invincTimer > 0 ? (Math.floor(ts / 80) % 2 === 0 ? 0.25 : 1) : 1;
    // Red cap
    ctx.fillStyle = '#e52222'; ctx.fillRect(px + 2, gs.playerY, PLAYER_W - 4, 8);
    ctx.fillRect(px, gs.playerY + 5, PLAYER_W, 4);
    // Face
    ctx.fillStyle = '#f5c48a'; ctx.fillRect(px + 3, gs.playerY + 8, PLAYER_W - 6, 10);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(px + 5, gs.playerY + 11, 3, 3); ctx.fillRect(px + PLAYER_W - 8, gs.playerY + 11, 3, 3);
    ctx.fillStyle = '#3a1a00'; ctx.fillRect(px + 4, gs.playerY + 15, PLAYER_W - 8, 2);
    // Body
    const shirtColor = gs.fireballCount > 0 ? '#ff6600' : gs.scoreMultTimer > 0 ? '#ff8800' : '#e52222';
    ctx.fillStyle = shirtColor; ctx.fillRect(px + 2, gs.playerY + 18, PLAYER_W - 4, 8);
    ctx.fillStyle = '#3344cc'; ctx.fillRect(px + 1, gs.playerY + 22, PLAYER_W - 2, 6);
    ctx.fillStyle = '#2233aa'; ctx.fillRect(px + 4, gs.playerY + 18, 4, 6); ctx.fillRect(px + PLAYER_W - 8, gs.playerY + 18, 4, 6);
    // Legs
    const legPhase = Math.sin(gs.frame * 0.3);
    ctx.fillStyle = '#3344cc';
    ctx.fillRect(px + 3, gs.playerY + PLAYER_H - 10, 7, 10 + legPhase * 3);
    ctx.fillRect(px + PLAYER_W - 10, gs.playerY + PLAYER_H - 10, 7, 10 - legPhase * 3);
    ctx.fillStyle = '#5c2e00';
    ctx.fillRect(px + 2, gs.playerY + PLAYER_H - 2, 8, 3);
    ctx.fillRect(px + PLAYER_W - 10, gs.playerY + PLAYER_H - 2, 8, 3);
    ctx.globalAlpha = 1;

    ctx.restore();

    // Particles
    gs.particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(particle.x + camX, particle.y, particle.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, 28);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffd700'; ctx.fillText(`SCORE: ${gs.score}`, 6, 19);
    ctx.fillStyle = '#ffd700'; ctx.fillText(`COINS: ${gs.coinsCollected}`, 140, 19);
    ctx.fillStyle = '#ff4444'; ctx.fillText(`LIVES: ${gs.lives}`, W - 90, 19);

    if (gs.fireballCount > 0) {
      ctx.fillStyle = '#ff6600'; ctx.fillText(`FIRE:${gs.fireballCount}`, W - 160, 19);
    }
    if (gs.shieldTimer > 0) { ctx.fillStyle = '#ffe040'; ctx.fillText('STAR', W - 200, 19); }
    if (gs.scoreMultTimer > 0 && gs.fireballCount === 0) { ctx.fillStyle = '#ff8800'; ctx.fillText('x2', W - 200, 19); }

    if (aiEnabledRef.current && !gs.aiDisabled && gs.alive) {
      ctx.fillStyle = 'rgba(0,200,255,0.8)';
      ctx.fillRect(W / 2 - 20, 4, 40, 18);
      ctx.fillStyle = '#000'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('AI', W / 2, 17); ctx.textAlign = 'left';
    }

    if (gs.stompChainTimer > 0 && gs.stompChain >= 2) {
      const fadeAlpha = Math.min(1, gs.stompChainTimer / 0.4);
      ctx.globalAlpha = fadeAlpha;
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${12 + gs.stompChain}px monospace`; ctx.textAlign = 'center';
      ctx.fillText(`${gs.stompChain}× COMBO! +${Math.min(gs.stompChain, 5) * 100}`, W / 2, 52);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
  }, []);

  const step = useCallback((dtMs: number, ts: number) => {
    const gs = gsRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;

    if (gs.alive && aiEnabledRef.current && !gs.aiDisabled) aiDecide(gs);

    if (gs.alive && gs.started) {
      gs.frame += 1;
      gs.score += Math.floor(gs.speed * 0.1);
      gs.speed = Math.min(2.6 + gs.frame * 0.0012, 6.6);

      // Horizontal player movement (left/right relative to screen)
      if (gs.leftHeld) gs.playerX = Math.max(PLAYER_X_MIN, gs.playerX - PLAYER_MOVE_SPEED);
      if (gs.rightHeld) gs.playerX = Math.min(PLAYER_X_MAX, gs.playerX + PLAYER_MOVE_SPEED);

      // Jump
      const canJump = gs.onGround || gs.coyoteTimer > 0;
      const jumpPower = gs.jumpBoostTimer > 0 ? JUMP_POWER * 1.3 : JUMP_POWER;
      if (gs.jumpQueued && canJump) {
        gs.playerVY = jumpPower;
        gs.onGround = false; gs.coyoteTimer = 0; gs.jumpHeldTime = 0;
        sfxRef.current('jump');
        for (let index = 0; index < 6; index += 1) {
          gs.particles.push({ x: gs.playerX + gs.worldX, y: gs.playerY + PLAYER_H, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 2, color: '#88aaff', life: 0.4, size: 4 });
        }
      }
      gs.jumpQueued = false;

      const dt = dtMs / 1000;
      if (gs.shieldTimer > 0) gs.shieldTimer -= dt;
      if (gs.scoreMultTimer > 0) gs.scoreMultTimer -= dt;
      if (gs.jumpBoostTimer > 0) gs.jumpBoostTimer -= dt;
      if (gs.fireballTimer > 0) gs.fireballTimer -= dt;
      if (gs.invincTimer > 0) gs.invincTimer -= dt;
      if (gs.coyoteTimer > 0) gs.coyoteTimer -= dt;
      if (gs.stompChainTimer > 0) gs.stompChainTimer -= dt;

      if (gs.jumpHeld && gs.playerVY < 0) {
        gs.jumpHeldTime += dt;
        gs.playerVY += gs.jumpHeldTime < 0.28 ? GRAVITY * 0.38 : GRAVITY;
      } else {
        gs.playerVY += GRAVITY;
      }

      gs.playerY += gs.playerVY;
      const wasOnGround = gs.onGround;
      gs.onGround = false;

      for (const platform of gs.platforms) {
        const worldPX = gs.playerX + gs.worldX;
        if (
          worldPX + PLAYER_W > platform.x &&
          worldPX < platform.x + platform.w &&
          gs.playerY + PLAYER_H > platform.y &&
          gs.playerY + PLAYER_H < platform.y + 20 &&
          gs.playerVY >= 0
        ) {
          gs.playerY = platform.y - PLAYER_H;
          gs.playerVY = 0; gs.onGround = true; gs.stompChain = 0;
          break;
        }
      }

      if (wasOnGround && !gs.onGround && gs.playerVY >= 0) gs.coyoteTimer = Math.max(gs.coyoteTimer, 0.12);
      if (gs.onGround) { gs.coyoteTimer = 0; gs.jumpHeldTime = 0; }

      gs.worldX += gs.speed;
      gs.spawnTimer -= gs.speed;
      if (gs.spawnTimer <= 0) {
        spawnChunk(gs);
        gs.spawnTimer = 180 + Math.random() * 110;
      }

      const minX = gs.worldX - 100;
      gs.platforms = gs.platforms.filter((p) => p.x + p.w > minX);
      gs.spikes = gs.spikes.filter((s) => s.x + s.w > minX);
      gs.coins = gs.coins.filter((c) => c.x > minX);
      gs.powerups = gs.powerups.filter((p) => p.x > minX);
      gs.enemies = gs.enemies.filter((e) => e.x + e.w > minX);
      gs.fireballs = gs.fireballs.filter((fb) => fb.x < gs.worldX + W + 100);

      gs.enemies.forEach((enemy) => {
        if (!enemy.alive) return;
        enemy.x += enemy.vx;
        let onPlatform = false;
        for (const platform of gs.platforms) {
          if (enemy.x + enemy.w > platform.x && enemy.x < platform.x + platform.w && enemy.y + enemy.h >= platform.y - 2) { onPlatform = true; }
        }
        if (!onPlatform) enemy.vx = -enemy.vx;
      });

      // Move fireballs + enemy collision
      for (let fi = gs.fireballs.length - 1; fi >= 0; fi -= 1) {
        const fb = gs.fireballs[fi];
        fb.x += fb.vx;
        fb.phase += 0.3;
        let hit = false;
        for (const enemy of gs.enemies) {
          if (!enemy.alive) continue;
          if (fb.x < enemy.x + enemy.w && fb.x + 10 > enemy.x && fb.y < enemy.y + enemy.h && fb.y + 10 > enemy.y) {
            enemy.alive = false;
            gs.score += 200 * (gs.scoreMultTimer > 0 ? 2 : 1);
            for (let pi = 0; pi < 8; pi += 1) {
              gs.particles.push({ x: enemy.x + enemy.w / 2, y: enemy.y + enemy.h / 2, vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 5, color: pi % 2 === 0 ? '#ff6600' : '#ffcc00', life: 0.6, size: 5 });
            }
            gs.fireballs.splice(fi, 1);
            hit = true;
            break;
          }
        }
        if (hit) continue;
      }

      const playerRect = { x: gs.playerX + gs.worldX, y: gs.playerY, w: PLAYER_W, h: PLAYER_H };

      for (const spike of gs.spikes) {
        if (rectsOverlap(playerRect, spike)) { takeDamage(gs); break; }
      }

      for (const enemy of gs.enemies) {
        if (!enemy.alive) continue;
        if (rectsOverlap(playerRect, { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h })) {
          if (gs.playerVY > 0 && gs.playerY + PLAYER_H < enemy.y + enemy.h * 0.6) {
            enemy.alive = false;
            gs.playerVY = -8;
            gs.stompChain += 1; gs.stompChainTimer = 1.5;
            const chainBonus = Math.min(gs.stompChain, 5) * 100;
            gs.score += chainBonus * (gs.scoreMultTimer > 0 ? 2 : 1);
            for (let si = 0; si < 8; si++) {
              gs.particles.push({ x: enemy.x + enemy.w / 2, y: enemy.y + enemy.h / 2, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 4, color: '#ffd700', life: 0.5, size: 4 });
            }
          } else {
            takeDamage(gs);
          }
          break;
        }
      }

      gs.coins.forEach((coin) => {
        if (!coin.collected && Math.hypot(coin.x - (playerRect.x + PLAYER_W / 2), coin.y - gs.playerY) < 20) {
          coin.collected = true;
          recordPlayerAction('collect:coin', { exploration: 0.66, tempo: 0.58 });
          gs.coinsCollected += 1;
          gs.score += 10 * (gs.scoreMultTimer > 0 ? 2 : 1);
          gs.particles.push({ x: coin.x, y: coin.y, vx: 0, vy: -3, color: '#ffd700', life: 0.5, size: 6 });
        }
      });

      gs.powerups.forEach((powerup) => {
        if (powerup.hitAnim > 0) powerup.hitAnim = Math.max(0, powerup.hitAnim - dtMs / 1000);
        if (powerup.collected) return;
        const bx = powerup.x - 10; const by = powerup.y - 10;
        if (
          gs.playerVY < 0 &&
          playerRect.x + PLAYER_W > bx + 2 && playerRect.x < bx + 18 &&
          gs.playerY <= by + 20 && gs.playerY > by - 2
        ) {
          powerup.collected = true; powerup.hitAnim = 0.45;
          gs.playerVY = Math.max(0, gs.playerVY + 3);
          recordPlayerAction('collect:powerup', { exploration: 0.68, risk: 0.34 });
          if (powerup.type === 'shield') gs.shieldTimer = 10;
          else if (powerup.type === 'score2x') gs.scoreMultTimer = 15;
          else if (powerup.type === 'jump') gs.jumpBoostTimer = 8;
          else if (powerup.type === 'fireball') { gs.fireballCount += 6; gs.fireballTimer = 20; }
          gs.score += 50 * (gs.scoreMultTimer > 0 ? 2 : 1);
          for (let ci = 0; ci < 6; ci++) {
            gs.particles.push({ x: powerup.x + (Math.random() - 0.5) * 10, y: powerup.y - 12, vx: (Math.random() - 0.5) * 3, vy: -3 - Math.random() * 3, color: powerup.type === 'fireball' ? '#ff6600' : '#ffd700', life: 0.7, size: 5 });
          }
        }
      });

      if (gs.playerY > H + 50) takeDamage(gs);

      gs.particles = gs.particles.filter((particle) => {
        particle.x += particle.vx; particle.y += particle.vy;
        particle.vy += 0.15; particle.life -= 0.04;
        return particle.life > 0;
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
  }, [aiDecide, draw, phase, recordPlayerAction, takeDamage]);

  useGameLoop(step);

  const handleJump = useCallback(() => {
    if (phase === 'gameover') return;
    recordPlayerAction('jump', { aggression: 0.58, risk: 0.52, tempo: 0.6 });
    queueJump(true);
  }, [phase, queueJump, recordPlayerAction]);

  const handleJumpRelease = useCallback(() => { releaseJump(); }, [releaseJump]);
  const handleLeft = useCallback(() => { startRun(true); gsRef.current.leftHeld = true; gsRef.current.aiDisabled = true; }, [startRun]);
  const handleLeftRelease = useCallback(() => { gsRef.current.leftHeld = false; }, []);
  const handleRight = useCallback(() => { startRun(true); gsRef.current.rightHeld = true; gsRef.current.aiDisabled = true; }, [startRun]);
  const handleRightRelease = useCallback(() => { gsRef.current.rightHeld = false; }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'KeyW', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyF'].includes(event.code)) event.preventDefault();
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') handleJump();
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') handleLeft();
      if (event.code === 'ArrowRight' || event.code === 'KeyD') handleRight();
      if (event.code === 'KeyF') shootFireball();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') handleJumpRelease();
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') handleLeftRelease();
      if (event.code === 'ArrowRight' || event.code === 'KeyD') handleRightRelease();
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
      footer={best > 0 ? <div className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Best run: {best.toLocaleString()}</div> : undefined}
      controls={(
        <MobileControlBar
          items={[
            { id: 'left', label: '◀', onPress: handleLeft, onRelease: handleLeftRelease },
            { id: 'jump', label: 'JUMP', onPress: handleJump, onRelease: handleJumpRelease, tone: 'accent' },
            { id: 'right', label: '▶', onPress: handleRight, onRelease: handleRightRelease },
            { id: 'fire', label: 'FIRE', onPress: shootFireball, tone: 'danger' },
          ]}
          hint="◀ ▶ to move, JUMP to hop, collect red ? boxes then FIRE to throw fireballs"
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
          title={phase === 'ready' ? 'Sprint, Stomp, Collect Coins!' : 'Run It Back'}
          subtitle={phase === 'ready'
            ? 'Move left/right, jump on enemies, collect red ? boxes for fireballs!'
            : 'Restart launches a fresh run. Collect red ? boxes to unlock fireballs.'}
          score={displayScore}
          best={best}
          primaryLabel={phase === 'ready' ? 'Start Run' : 'Play Again'}
          onPrimary={phase === 'ready' ? () => queueJump(false) : resetGame}
          secondaryLabel="Back to Hub"
          onSecondary={() => navigate('menu')}
        />
      </div>
    </GameWrapper>
  );
}
