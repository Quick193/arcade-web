/* eslint-disable react-hooks/immutability */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { GameOverlay } from '../components/GameOverlay';
import { MobileControlBar } from '../components/MobileControlBar';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';
import { useGameLoop } from '../hooks/useGameLoop';
import { useMobileCanvasSize } from '../hooks/useMobileCanvasSize';

const W = 480;
const H = 320;
const GRAVITY = 0.5;
const JUMP_POWER = -12.2;
const GROUND_Y = 260;
const PLAYER_W = 24;
const PLAYER_H = 32;
const PLAYER_X = 60;

interface Platform { x: number; y: number; w: number; h: number; }
interface Enemy { x: number; y: number; w: number; h: number; vx: number; alive: boolean; }
interface Spike { x: number; y: number; w: number; h: number; }
interface Coin { x: number; y: number; collected: boolean; }
interface Powerup { x: number; y: number; type: 'shield' | 'score2x' | 'jump'; collected: boolean; hitAnim: number; }
interface Particle { x: number; y: number; vx: number; vy: number; color: string; life: number; size: number; }

interface GS {
  playerY: number;
  playerVY: number;
  onGround: boolean;
  platforms: Platform[];
  enemies: Enemy[];
  spikes: Spike[];
  coins: Coin[];
  powerups: Powerup[];
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
    playerY: GROUND_Y - PLAYER_H,
    playerVY: 0,
    onGround: true,
    platforms: [{ x: 0, y: GROUND_Y, w: W * 4, h: H - GROUND_Y }],
    enemies: [],
    spikes: [],
    coins: [],
    powerups: [],
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
    if (Math.random() < 0.4) {
      const types: Powerup['type'][] = ['shield', 'score2x', 'jump'];
      gs.powerups.push({ x: rightEdge + 120, y: GROUND_Y - 80, type: types[Math.floor(Math.random() * 3)], collected: false, hitAnim: 0 });
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
  const canvasSize = useMobileCanvasSize({ width: W, height: H, reservedVerticalSpace: 290 });
  const best = bestScore('runner');

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
        gs.particles.push({
          x: PLAYER_X + gs.worldX + PLAYER_W / 2,
          y: gs.playerY + PLAYER_H / 2,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          color: '#4488ff',
          life: 0.5,
          size: 5,
        });
      }
      return;
    }

    gs.lives -= 1;
    gs.invincTimer = 2.0;
    gs.stompChain = 0;
    if (gs.lives <= 0) {
      for (let index = 0; index < 20; index += 1) {
        gs.particles.push({
          x: PLAYER_X + gs.worldX + PLAYER_W / 2,
          y: gs.playerY,
          vx: (Math.random() - 0.5) * 10,
          vy: -Math.random() * 8,
          color: '#ff4444',
          life: 1,
          size: 5,
        });
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
    return () => {
      ctxRef.current = null;
    };
  }, []);

  const aiDecide = useCallback((gs: GS) => {
    if (!aiEnabledRef.current || gs.aiDisabled || !gs.alive) return;
    if (!gs.started) {
      gs.started = true;
      setPhase('playing');
    }

    const px = PLAYER_X + gs.worldX;
    const lookAhead = gs.speed * (isAdaptive ? 18 + getTraitValue('precision') * 12 : 22) + px;
    let shouldJump = false;
    let coinJump = false;
    let powerupJump = false;

    for (const spike of gs.spikes) {
      if (spike.x > px && spike.x < lookAhead && spike.y < gs.playerY + PLAYER_H + 5) {
        shouldJump = true;
        break;
      }
    }

    if (!shouldJump) {
      for (const enemy of gs.enemies) {
        if (!enemy.alive) continue;
        if (enemy.x > px && enemy.x < lookAhead && Math.abs(enemy.y - gs.playerY) < 40) {
          shouldJump = true;
          break;
        }
      }
    }

    if (getActionWeight('jump:coin') >= getActionWeight('jump') || (isAdaptive && getTraitValue('exploration') > 0.58)) {
      for (const coin of gs.coins) {
        if (!coin.collected && coin.x > px + 24 && coin.x < lookAhead && coin.y < gs.playerY - 12) {
          coinJump = true;
          break;
        }
      }
    }

    if (getActionWeight('collect:powerup') >= 1 || (isAdaptive && getTraitValue('exploration') > 0.5)) {
      for (const powerup of gs.powerups) {
        if (!powerup.collected && powerup.x > px + 20 && powerup.x < lookAhead && powerup.y < gs.playerY + 8) {
          powerupJump = true;
          break;
        }
      }
    }

    let hasPlatformAhead = false;
    for (const platform of gs.platforms) {
      if (platform.x < px + 80 && platform.x + platform.w > px + 20 && platform.y >= GROUND_Y - 2) {
        hasPlatformAhead = true;
        break;
      }
    }
    if (!hasPlatformAhead) shouldJump = true;

    gs.jumpQueued = (shouldJump || coinJump || powerupJump) && gs.onGround;
  }, [getActionWeight, getTraitValue, isAdaptive]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, gs: GS, ts: number) => {
    // --- Background: Mario blue sky ---
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, W, H);

    // --- Scrolling white puffy clouds (4 clouds at 0.15x parallax speed) ---
    const cloudOffX = (gs.worldX * 0.15) % (W + 120);
    const cloudDefs = [
      { ox: 60,  oy: 40,  rx: 32, ry: 16 },
      { ox: 200, oy: 28,  rx: 24, ry: 13 },
      { ox: 340, oy: 52,  rx: 28, ry: 14 },
      { ox: 480, oy: 36,  rx: 36, ry: 18 },
    ];
    ctx.fillStyle = '#ffffff';
    cloudDefs.forEach(({ ox, oy, rx, ry }) => {
      const cx = ((ox - cloudOffX % (W + 120) + W + 120) % (W + 120)) - 60;
      // puff cluster: three overlapping ellipses
      ctx.beginPath();
      ctx.ellipse(cx, oy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - rx * 0.55, oy + ry * 0.35, rx * 0.65, ry * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + rx * 0.55, oy + ry * 0.35, rx * 0.65, ry * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    const camX = -gs.worldX;
    ctx.save();
    ctx.translate(camX, 0);

    // --- Platforms ---
    gs.platforms.forEach((platform) => {
      if (platform.x + platform.w < gs.worldX - 50 || platform.x > gs.worldX + W + 50) return;

      if (platform.h > 40) {
        // Ground platform: brown brick body with grass top
        ctx.fillStyle = '#8b5e3c';
        ctx.fillRect(platform.x, platform.y, platform.w, platform.h);

        // Brick grid lines on body
        ctx.strokeStyle = '#6b4020';
        ctx.lineWidth = 1;
        const brickH = 12;
        const brickW = 24;
        for (let row = 0; row * brickH < platform.h; row += 1) {
          const offsetX = (row % 2 === 0) ? 0 : brickW / 2;
          for (let col = -1; col * brickW < platform.w + brickW; col += 1) {
            const bx = platform.x + col * brickW + offsetX;
            const by = platform.y + row * brickH;
            ctx.strokeRect(bx, by, brickW, brickH);
          }
        }

        // Grass top strip
        ctx.fillStyle = '#4fc940';
        ctx.fillRect(platform.x, platform.y, platform.w, 8);
        // Darker grass highlight
        ctx.fillStyle = '#3ab830';
        ctx.fillRect(platform.x, platform.y + 8, platform.w, 2);
      } else {
        // Floating platform: brick block style
        ctx.fillStyle = '#c84b11';
        ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
        // Brick outline grid
        ctx.strokeStyle = '#8b5e3c';
        ctx.lineWidth = 1.5;
        const bW = 16;
        for (let col = 0; col * bW < platform.w; col += 1) {
          ctx.strokeRect(platform.x + col * bW, platform.y, bW, platform.h);
        }
        // Top highlight
        ctx.fillStyle = '#e06020';
        ctx.fillRect(platform.x, platform.y, platform.w, 3);
      }
    });

    // --- Spikes -> Green Pipes ---
    gs.spikes.forEach((spike) => {
      const pipeX = spike.x;
      const pipeTop = spike.y;
      const pipeW = spike.w;
      const pipeH = spike.h;
      const capH = Math.min(6, pipeH);
      const capExtra = 4;

      // Pipe body
      ctx.fillStyle = '#2e8b2e';
      ctx.fillRect(pipeX + 2, pipeTop + capH, pipeW - 4, pipeH - capH);

      // Pipe body highlight
      ctx.fillStyle = '#3cb33c';
      ctx.fillRect(pipeX + 4, pipeTop + capH, 4, pipeH - capH);

      // Pipe cap (wider)
      ctx.fillStyle = '#2e8b2e';
      ctx.fillRect(pipeX - capExtra, pipeTop, pipeW + capExtra * 2, capH);

      // Cap highlight
      ctx.fillStyle = '#3cb33c';
      ctx.fillRect(pipeX - capExtra + 2, pipeTop, 4, capH);

      // Dark outline on pipe
      ctx.strokeStyle = '#1a5c1a';
      ctx.lineWidth = 1;
      ctx.strokeRect(pipeX + 2, pipeTop + capH, pipeW - 4, pipeH - capH);
      ctx.strokeRect(pipeX - capExtra, pipeTop, pipeW + capExtra * 2, capH);
    });

    // --- Coins: gold circles with shine glint ---
    gs.coins.forEach((coin) => {
      if (coin.collected) return;
      const pulse = 0.85 + 0.15 * Math.sin(ts / 180 + coin.x * 0.05);
      ctx.globalAlpha = pulse;

      // Coin body
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Coin inner ring
      ctx.strokeStyle = '#e6a800';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 5.5, 0, Math.PI * 2);
      ctx.stroke();

      // Shine glint
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(coin.x - 2, coin.y - 2, 2.5, 1.5, -0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
    });

    // --- Powerups: Question-mark boxes ---
    gs.powerups.forEach((powerup) => {
      if (powerup.collected && powerup.hitAnim <= 0) return;
      const bx = powerup.x - 10;
      const by = powerup.y - 10;
      const bSize = 20;
      // When hit: pop upward; when idle: gentle idle bob
      const bounce = powerup.hitAnim > 0
        ? -Math.sin(powerup.hitAnim * Math.PI * 5) * 9
        : Math.sin(ts / 300 + powerup.x * 0.1) * 2;

      // Box body (dark when used)
      ctx.fillStyle = powerup.collected ? '#6b4500' : '#e8a000';
      ctx.fillRect(bx, by + bounce, bSize, bSize);

      // Box highlight (top/left edges)
      ctx.fillStyle = powerup.collected ? '#7a5200' : '#ffc800';
      ctx.fillRect(bx, by + bounce, bSize, 3);
      ctx.fillRect(bx, by + bounce, 3, bSize);

      // Box shadow (bottom/right edges)
      ctx.fillStyle = powerup.collected ? '#3a2200' : '#a06000';
      ctx.fillRect(bx, by + bounce + bSize - 3, bSize, 3);
      ctx.fillRect(bx + bSize - 3, by + bounce, 3, bSize);

      // '?' only on unused blocks
      if (!powerup.collected) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', powerup.x, powerup.y + bounce + 5);
        ctx.textAlign = 'left';
      }
    });

    // --- Enemies: Goomba style ---
    gs.enemies.forEach((enemy) => {
      if (!enemy.alive) return;
      const ex = enemy.x;
      const ey = enemy.y;
      const ew = enemy.w;
      const eh = enemy.h;

      // Goomba body (mushroom-brown, rounded top)
      ctx.fillStyle = '#8b4513';
      ctx.beginPath();
      ctx.arc(ex + ew / 2, ey + eh * 0.45, ew * 0.5, Math.PI, 0);
      ctx.rect(ex, ey + eh * 0.45, ew, eh * 0.55);
      ctx.fill();

      // Slightly lighter belly patch
      ctx.fillStyle = '#c47a3a';
      ctx.fillRect(ex + ew * 0.2, ey + eh * 0.5, ew * 0.6, eh * 0.28);

      // Angry eyebrows (two dark diagonal lines)
      ctx.strokeStyle = '#2a0a00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex + 3, ey + eh * 0.3);
      ctx.lineTo(ex + ew * 0.42, ey + eh * 0.38);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex + ew - 3, ey + eh * 0.3);
      ctx.lineTo(ex + ew * 0.58, ey + eh * 0.38);
      ctx.stroke();

      // White eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(ex + 4, ey + eh * 0.35, 5, 5);
      ctx.fillRect(ex + ew - 9, ey + eh * 0.35, 5, 5);

      // Dark pupils
      ctx.fillStyle = '#111';
      ctx.fillRect(ex + 5, ey + eh * 0.38, 3, 3);
      ctx.fillRect(ex + ew - 8, ey + eh * 0.38, 3, 3);

      // Little feet
      const footBob = Math.sin(enemy.x * 0.2) * 2;
      ctx.fillStyle = '#3a1a00';
      ctx.fillRect(ex + 1, ey + eh - 4 + footBob, 8, 4);
      ctx.fillRect(ex + ew - 9, ey + eh - 4 - footBob, 8, 4);
    });

    // --- Player: Mario style ---
    const px = PLAYER_X + gs.worldX;

    // Flicker every ~80ms when invincible after a hit
    if (gs.invincTimer > 0) {
      ctx.globalAlpha = Math.floor(ts / 80) % 2 === 0 ? 0.25 : 1;
    }

    // Star glow if shield active
    if (gs.shieldTimer > 0) {
      const glowAlpha = 0.5 + 0.5 * Math.abs(Math.sin(ts / 100));
      ctx.globalAlpha = glowAlpha;
      const starGlow = ctx.createRadialGradient(
        px + PLAYER_W / 2, gs.playerY + PLAYER_H / 2, 4,
        px + PLAYER_W / 2, gs.playerY + PLAYER_H / 2, PLAYER_W + 6
      );
      starGlow.addColorStop(0, '#ffffa0');
      starGlow.addColorStop(0.5, '#ffdd00');
      starGlow.addColorStop(1, 'rgba(255,200,0,0)');
      ctx.fillStyle = starGlow;
      ctx.beginPath();
      ctx.arc(px + PLAYER_W / 2, gs.playerY + PLAYER_H / 2, PLAYER_W + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Red cap (top ~8px)
    ctx.fillStyle = '#e52222';
    ctx.fillRect(px + 2, gs.playerY, PLAYER_W - 4, 8);
    // Cap brim (slightly wider)
    ctx.fillRect(px, gs.playerY + 5, PLAYER_W, 4);

    // Skin face below cap
    ctx.fillStyle = '#f5c48a';
    ctx.fillRect(px + 3, gs.playerY + 8, PLAYER_W - 6, 10);

    // Eyes
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(px + 5, gs.playerY + 11, 3, 3);
    ctx.fillRect(px + PLAYER_W - 8, gs.playerY + 11, 3, 3);

    // Mustache
    ctx.fillStyle = '#3a1a00';
    ctx.fillRect(px + 4, gs.playerY + 15, PLAYER_W - 8, 2);

    // Red shirt/body
    ctx.fillStyle = gs.scoreMultTimer > 0 ? '#ff8800' : '#e52222';
    ctx.fillRect(px + 2, gs.playerY + 18, PLAYER_W - 4, 8);

    // Blue overalls (lower body)
    ctx.fillStyle = '#3344cc';
    ctx.fillRect(px + 1, gs.playerY + 22, PLAYER_W - 2, 6);

    // Overall straps
    ctx.fillStyle = '#2233aa';
    ctx.fillRect(px + 4, gs.playerY + 18, 4, 6);
    ctx.fillRect(px + PLAYER_W - 8, gs.playerY + 18, 4, 6);

    // Animated legs
    const legPhase = Math.sin(gs.frame * 0.3);
    ctx.fillStyle = '#3344cc';
    ctx.fillRect(px + 3, gs.playerY + PLAYER_H - 10, 7, 10 + legPhase * 3);
    ctx.fillRect(px + PLAYER_W - 10, gs.playerY + PLAYER_H - 10, 7, 10 - legPhase * 3);

    // Brown shoes
    ctx.fillStyle = '#5c2e00';
    ctx.fillRect(px + 2, gs.playerY + PLAYER_H - 2, 8, 3);
    ctx.fillRect(px + PLAYER_W - 10, gs.playerY + PLAYER_H - 2, 8, 3);

    ctx.globalAlpha = 1; // reset after possible flicker
    ctx.restore();

    // --- Particles (unchanged) ---
    gs.particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x + camX, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // --- HUD: Mario-style ---
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, 28);

    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`SCORE: ${gs.score}`, 6, 19);

    ctx.fillStyle = '#ffd700';
    ctx.fillText(`COINS: ${gs.coinsCollected}`, 140, 19);

    ctx.fillStyle = '#ff4444';
    ctx.fillText(`LIVES: ${gs.lives}`, W - 90, 19);

    if (gs.shieldTimer > 0) {
      ctx.fillStyle = '#ffe040';
      ctx.fillText('STAR', W - 130, 19);
    }
    if (gs.scoreMultTimer > 0) {
      ctx.fillStyle = '#ff8800';
      ctx.fillText('x2', W - 160, 19);
    }

    if (aiEnabledRef.current && !gs.aiDisabled && gs.alive) {
      ctx.fillStyle = 'rgba(0,200,255,0.8)';
      ctx.fillRect(W / 2 - 20, 4, 40, 18);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AI', W / 2, 17);
      ctx.textAlign = 'left';
    }

    // Stomp chain combo display
    if (gs.stompChainTimer > 0 && gs.stompChain >= 2) {
      const fadeAlpha = Math.min(1, gs.stompChainTimer / 0.4);
      ctx.globalAlpha = fadeAlpha;
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${12 + gs.stompChain}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${gs.stompChain}× COMBO! +${Math.min(gs.stompChain, 5) * 100}`, W / 2, 52);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
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

      // Coyote time lets player jump shortly after walking off an edge
      const canJump = gs.onGround || gs.coyoteTimer > 0;
      const jumpPower = gs.jumpBoostTimer > 0 ? JUMP_POWER * 1.3 : JUMP_POWER;
      if (gs.jumpQueued && canJump) {
        gs.playerVY = jumpPower;
        gs.onGround = false;
        gs.coyoteTimer = 0;
        gs.jumpHeldTime = 0;
        for (let index = 0; index < 6; index += 1) {
          gs.particles.push({
            x: PLAYER_X + gs.worldX,
            y: gs.playerY + PLAYER_H,
            vx: (Math.random() - 0.5) * 4,
            vy: Math.random() * 2,
            color: '#88aaff',
            life: 0.4,
            size: 4,
          });
        }
      }
      gs.jumpQueued = false;

      const dt = dtMs / 1000;
      if (gs.shieldTimer > 0) gs.shieldTimer -= dt;
      if (gs.scoreMultTimer > 0) gs.scoreMultTimer -= dt;
      if (gs.jumpBoostTimer > 0) gs.jumpBoostTimer -= dt;
      if (gs.invincTimer > 0) gs.invincTimer -= dt;
      if (gs.coyoteTimer > 0) gs.coyoteTimer -= dt;
      if (gs.stompChainTimer > 0) gs.stompChainTimer -= dt;

      // Variable jump: while holding button and still ascending, apply reduced gravity
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
        const px = PLAYER_X + gs.worldX;
        if (
          px + PLAYER_W > platform.x &&
          px < platform.x + platform.w &&
          gs.playerY + PLAYER_H > platform.y &&
          gs.playerY + PLAYER_H < platform.y + 20 &&
          gs.playerVY >= 0
        ) {
          gs.playerY = platform.y - PLAYER_H;
          gs.playerVY = 0;
          gs.onGround = true;
          gs.stompChain = 0; // chain resets on ground contact
          break;
        }
      }

      // Coyote time: allow jump briefly after walking off an edge
      if (wasOnGround && !gs.onGround && gs.playerVY >= 0) {
        gs.coyoteTimer = Math.max(gs.coyoteTimer, 0.12);
      }
      if (gs.onGround) { gs.coyoteTimer = 0; gs.jumpHeldTime = 0; }

      gs.worldX += gs.speed;
      gs.spawnTimer -= gs.speed;
      if (gs.spawnTimer <= 0) {
        spawnChunk(gs);
        gs.spawnTimer = 180 + Math.random() * 110;
      }

      const minX = gs.worldX - 100;
      gs.platforms = gs.platforms.filter((platform) => platform.x + platform.w > minX);
      gs.spikes = gs.spikes.filter((spike) => spike.x + spike.w > minX);
      gs.coins = gs.coins.filter((coin) => coin.x > minX);
      gs.powerups = gs.powerups.filter((powerup) => powerup.x > minX);
      gs.enemies = gs.enemies.filter((enemy) => enemy.x + enemy.w > minX);

      gs.enemies.forEach((enemy) => {
        if (!enemy.alive) return;
        enemy.x += enemy.vx;
        let onPlatform = false;
        for (const platform of gs.platforms) {
          if (enemy.x + enemy.w > platform.x && enemy.x < platform.x + platform.w && enemy.y + enemy.h >= platform.y - 2) {
            onPlatform = true;
          }
        }
        if (!onPlatform) enemy.vx = -enemy.vx;
      });

      const playerRect = { x: PLAYER_X + gs.worldX, y: gs.playerY, w: PLAYER_W, h: PLAYER_H };
      for (const spike of gs.spikes) {
        if (rectsOverlap(playerRect, spike)) {
          takeDamage(gs);
          break;
        }
      }

      for (const enemy of gs.enemies) {
        if (!enemy.alive) continue;
        if (rectsOverlap(playerRect, { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h })) {
          if (gs.playerVY > 0 && gs.playerY + PLAYER_H < enemy.y + enemy.h * 0.6) {
            enemy.alive = false;
            gs.playerVY = -8;
            gs.stompChain += 1;
            gs.stompChainTimer = 1.5;
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
        if (powerup.hitAnim > 0) powerup.hitAnim = Math.max(0, powerup.hitAnim - dt);
        if (powerup.collected) return;
        // Hit ? block from below: player's head enters block bottom while going up
        const bx = powerup.x - 10;
        const by = powerup.y - 10;
        if (
          gs.playerVY < 0 &&
          playerRect.x + PLAYER_W > bx + 2 && playerRect.x < bx + 18 &&
          gs.playerY <= by + 20 && gs.playerY > by - 2
        ) {
          powerup.collected = true;
          powerup.hitAnim = 0.45;
          gs.playerVY = Math.max(0, gs.playerVY + 3); // bump head back down
          recordPlayerAction('collect:powerup', { exploration: 0.68, risk: 0.34 });
          if (powerup.type === 'shield') gs.shieldTimer = 10;
          else if (powerup.type === 'score2x') gs.scoreMultTimer = 15;
          else if (powerup.type === 'jump') gs.jumpBoostTimer = 8;
          gs.score += 50 * (gs.scoreMultTimer > 0 ? 2 : 1);
          for (let ci = 0; ci < 6; ci++) {
            gs.particles.push({ x: powerup.x + (Math.random() - 0.5) * 10, y: powerup.y - 12, vx: (Math.random() - 0.5) * 3, vy: -3 - Math.random() * 3, color: '#ffd700', life: 0.7, size: 5 });
          }
        }
      });

      if (gs.playerY > H + 50) takeDamage(gs);
      gs.particles = gs.particles.filter((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.15;
        particle.life -= 0.04;
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

  const handleJumpRelease = useCallback(() => {
    releaseJump();
  }, [releaseJump]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'ArrowUp' && event.code !== 'KeyW') return;
      event.preventDefault();
      handleJump();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'ArrowUp' && event.code !== 'KeyW') return;
      handleJumpRelease();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleJump, handleJumpRelease]);

  return (
    <GameWrapper
      title="Mario Run"
      score={displayScore}
      onRestart={resetGame}
      footer={best > 0 ? <div className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Best run: {best.toLocaleString()}</div> : undefined}
      controls={(
        <MobileControlBar
          items={[{ id: 'jump', label: 'JUMP', onPress: handleJump, onRelease: handleJumpRelease, tone: 'accent', wide: true }]}
          hint="Tap anywhere or JUMP to begin. Coins and powerups now count toward both Classic AI and Learn Me behavior."
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
            ? 'This run now opens with a clean start overlay and uses the same restart and hub pattern as the other twitch games.'
            : 'Restart launches a fresh run immediately. Hub stays in the bottom rail if you want to swap games.'}
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
