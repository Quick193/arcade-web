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
interface Powerup { x: number; y: number; type: 'shield' | 'score2x' | 'jump'; collected: boolean; }
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
    lives: 5,
    spawnTimer: 210,
    aiDisabled: false,
    bestSession: 0,
    jumpQueued: false,
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
      gs.powerups.push({ x: rightEdge + 120, y: GROUND_Y - 80, type: types[Math.floor(Math.random() * 3)], collected: false });
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
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1a1a3e');
    sky.addColorStop(1, '#2d2d5e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const bgOffX = (gs.worldX * 0.2) % W;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let index = 0; index < 8; index += 1) {
      const bx = ((index * 73 + bgOffX) % (W + 60)) - 30;
      const by = 30 + (index * 37) % 80;
      ctx.beginPath();
      ctx.ellipse(bx, by, 30 + index * 5, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const camX = -gs.worldX;
    ctx.save();
    ctx.translate(camX, 0);

    gs.platforms.forEach((platform) => {
      if (platform.x + platform.w < gs.worldX - 50 || platform.x > gs.worldX + W + 50) return;
      ctx.fillStyle = '#2d5a27';
      ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
      ctx.fillStyle = '#4a8c3f';
      ctx.fillRect(platform.x, platform.y, platform.w, 6);
    });

    gs.spikes.forEach((spike) => {
      ctx.fillStyle = '#cc4444';
      ctx.beginPath();
      ctx.moveTo(spike.x, spike.y + spike.h);
      ctx.lineTo(spike.x + spike.w / 2, spike.y);
      ctx.lineTo(spike.x + spike.w, spike.y + spike.h);
      ctx.closePath();
      ctx.fill();
    });

    gs.coins.forEach((coin) => {
      if (coin.collected) return;
      const pulse = 0.8 + 0.2 * Math.sin(ts / 200 + coin.x);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    gs.powerups.forEach((powerup) => {
      if (powerup.collected) return;
      const colors = { shield: '#4488ff', score2x: '#ff8800', jump: '#44ff88' };
      ctx.fillStyle = colors[powerup.type];
      ctx.fillRect(powerup.x - 10, powerup.y - 10, 20, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(powerup.type[0].toUpperCase(), powerup.x, powerup.y + 4);
      ctx.textAlign = 'left';
    });

    gs.enemies.forEach((enemy) => {
      if (!enemy.alive) return;
      ctx.fillStyle = '#cc3333';
      ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(enemy.x + 4, enemy.y + 4, 6, 6);
      ctx.fillRect(enemy.x + enemy.w - 10, enemy.y + 4, 6, 6);
      ctx.fillStyle = '#000';
      ctx.fillRect(enemy.x + 5, enemy.y + 5, 3, 3);
      ctx.fillRect(enemy.x + enemy.w - 9, enemy.y + 5, 3, 3);
    });

    const px = PLAYER_X + gs.worldX;
    if (gs.shieldTimer > 0) {
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(ts / 150);
      ctx.beginPath();
      ctx.arc(px + PLAYER_W / 2, gs.playerY + PLAYER_H / 2, PLAYER_W, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = gs.scoreMultTimer > 0 ? '#ff8800' : '#4488ff';
    ctx.fillRect(px, gs.playerY, PLAYER_W, PLAYER_H);
    ctx.fillStyle = '#ffcc88';
    ctx.fillRect(px + 4, gs.playerY + 4, PLAYER_W - 8, 14);
    ctx.fillStyle = '#333';
    ctx.fillRect(px + 6, gs.playerY + 7, 4, 4);
    ctx.fillRect(px + 14, gs.playerY + 7, 4, 4);

    const legPhase = Math.sin(gs.frame * 0.3);
    ctx.fillStyle = '#2255bb';
    ctx.fillRect(px + 4, gs.playerY + PLAYER_H - 10, 6, 10 + legPhase * 3);
    ctx.fillRect(px + PLAYER_W - 10, gs.playerY + PLAYER_H - 10, 6, 10 - legPhase * 3);
    ctx.restore();

    gs.particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x + camX, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, 28);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`Score: ${gs.score}`, 6, 19);
    ctx.fillText(`🪙 ${gs.coinsCollected}`, 120, 19);
    ctx.fillText('❤'.repeat(gs.lives), W - 70, 19);
    if (gs.shieldTimer > 0) {
      ctx.fillStyle = '#4488ff';
      ctx.fillText('🛡', W - 100, 19);
    }
    if (gs.scoreMultTimer > 0) {
      ctx.fillStyle = '#ff8800';
      ctx.fillText('×2', W - 120, 19);
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

      const jumpPower = gs.jumpBoostTimer > 0 ? JUMP_POWER * 1.3 : JUMP_POWER;
      if (gs.jumpQueued && gs.onGround) {
        gs.playerVY = jumpPower;
        gs.onGround = false;
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

      gs.playerVY += GRAVITY;
      gs.playerY += gs.playerVY;
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
          break;
        }
      }

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
          if (gs.playerVY > 0 && gs.playerY + PLAYER_H < enemy.y + enemy.h / 2) {
            enemy.alive = false;
            gs.playerVY = -8;
            gs.score += 50 * (gs.scoreMultTimer > 0 ? 2 : 1);
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
        if (!powerup.collected && Math.hypot(powerup.x - (playerRect.x + PLAYER_W / 2), powerup.y - gs.playerY) < 24) {
          powerup.collected = true;
          recordPlayerAction('collect:powerup', { exploration: 0.68, risk: 0.34 });
          if (powerup.type === 'shield') gs.shieldTimer = 10;
          else if (powerup.type === 'score2x') gs.scoreMultTimer = 15;
          else if (powerup.type === 'jump') gs.jumpBoostTimer = 8;
          gs.particles.push({ x: powerup.x, y: powerup.y, vx: 0, vy: -4, color: '#00ffff', life: 0.6, size: 8 });
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'ArrowUp' && event.code !== 'KeyW') return;
      event.preventDefault();
      handleJump();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleJump]);

  return (
    <GameWrapper
      title="Endless Runner"
      score={displayScore}
      onRestart={resetGame}
      footer={best > 0 ? <div className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Best run: {best.toLocaleString()}</div> : undefined}
      controls={(
        <MobileControlBar
          items={[{ id: 'jump', label: 'JUMP', onPress: handleJump, tone: 'accent', wide: true }]}
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
          className="game-canvas rounded-[28px] border border-white/10 bg-black/20 shadow-2xl"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        />
        <GameOverlay
          visible={phase !== 'playing'}
          eyebrow={phase === 'ready' ? 'Touch Run' : 'Run Ended'}
          title={phase === 'ready' ? 'Sprint, Stomp, Collect' : 'Run It Back'}
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
