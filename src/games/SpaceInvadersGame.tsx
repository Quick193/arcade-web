/* eslint-disable react-hooks/immutability */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { GameOverlay } from '../components/GameOverlay';
import { MobileControlBar } from '../components/MobileControlBar';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';
import { useGameLoop } from '../hooks/useGameLoop';
import { useMobileCanvasSize } from '../hooks/useMobileCanvasSize';

const W = 320;
const H = 480;
const INVADER_COLS = 8;
const INVADER_ROWS = 4;
const INVADER_W = 28;
const INVADER_H = 20;
const INVADER_GAP_X = 6;
const INVADER_GAP_Y = 8;
type InvaderType = 0 | 1 | 2;
const INVADER_SCORES = [30, 20, 20, 10];

interface Invader { x: number; y: number; type: InvaderType; alive: boolean; }
interface Bullet { x: number; y: number; vy: number; }
interface Shield { cells: boolean[][]; x: number; y: number; }
interface UFO { x: number; y: number; score: number; active: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }
interface GS {
  invaders: Invader[];
  playerX: number;
  playerBullet: Bullet | null;
  enemyBullets: Bullet[];
  shields: Shield[];
  ufo: UFO;
  score: number;
  lives: number;
  wave: number;
  sweepDx: number;
  sweepTimer: number;
  sweepSpeed: number;
  animTimer: number;
  animFrame: number;
  gameOver: boolean;
  started: boolean;
  ufoTimer: number;
  startTime: number;
  particles: Particle[];
  aiDisabled: boolean;
  keys: Set<string>;
  lastEnemyShot: number;
}

function makeShield(x: number): Shield {
  const cells: boolean[][] = [];
  for (let r = 0; r < 5; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < 8; c += 1) {
      if (r === 0 && (c < 2 || c > 5)) row.push(false);
      else if (r === 4 && (c === 3 || c === 4)) row.push(false);
      else row.push(true);
    }
    cells.push(row);
  }
  return { cells, x, y: H - 100 };
}

function makeInvaders(): Invader[] {
  const invaders: Invader[] = [];
  for (let row = 0; row < INVADER_ROWS; row += 1) {
    for (let col = 0; col < INVADER_COLS; col += 1) {
      const type: InvaderType = row === 0 ? 0 : row < 3 ? 1 : 2;
      invaders.push({ x: 20 + col * (INVADER_W + INVADER_GAP_X), y: 60 + row * (INVADER_H + INVADER_GAP_Y), type, alive: true });
    }
  }
  return invaders;
}

function drawInvader(ctx: CanvasRenderingContext2D, x: number, y: number, type: InvaderType, frame: number, color: string) {
  ctx.fillStyle = color;
  if (type === 0) {
    ctx.fillRect(x + 10, y, 8, 4);
    ctx.fillRect(x + 4, y + 4, 20, 10);
    ctx.fillRect(x, y + 8, 28, 8);
    ctx.fillRect(x + 4, y + 14, 6, 4);
    ctx.fillRect(x + 18, y + 14, 6, 4);
    if (frame === 0) {
      ctx.fillRect(x + 2, y + 12, 4, 4);
      ctx.fillRect(x + 22, y + 12, 4, 4);
    } else {
      ctx.fillRect(x, y + 14, 4, 4);
      ctx.fillRect(x + 24, y + 14, 4, 4);
    }
  } else if (type === 1) {
    ctx.fillRect(x + 8, y, 12, 4);
    ctx.fillRect(x + 4, y + 4, 20, 8);
    ctx.fillRect(x + 2, y + 8, 24, 8);
    ctx.fillRect(x, y + 12, 6, 6);
    ctx.fillRect(x + 22, y + 12, 6, 6);
    if (frame === 0) {
      ctx.fillRect(x + 2, y + 14, 4, 4);
      ctx.fillRect(x + 22, y + 14, 4, 4);
    } else {
      ctx.fillRect(x, y + 16, 4, 4);
      ctx.fillRect(x + 24, y + 16, 4, 4);
    }
  } else {
    ctx.fillRect(x + 4, y, 20, 4);
    ctx.fillRect(x, y + 4, 28, 10);
    ctx.fillRect(x + 4, y + 14, 6, 4);
    ctx.fillRect(x + 10, y + 14, 8, 4);
    ctx.fillRect(x + 18, y + 14, 6, 4);
    if (frame === 0) {
      ctx.fillRect(x, y + 8, 4, 6);
      ctx.fillRect(x + 24, y + 8, 4, 6);
    } else {
      ctx.fillRect(x, y + 10, 4, 6);
      ctx.fillRect(x + 24, y + 10, 4, 6);
    }
  }
}

function createState(wave = 1): GS {
  return {
    invaders: makeInvaders(),
    playerX: W / 2 - 14,
    playerBullet: null,
    enemyBullets: [],
    shields: [20, 85, 150, 215].map(makeShield),
    ufo: { x: -30, y: 30, score: 0, active: false },
    score: 0,
    lives: 3,
    wave,
    sweepDx: 1,
    sweepTimer: 0,
    sweepSpeed: Math.max(30, 80 - wave * 10),
    animTimer: 0,
    animFrame: 0,
    gameOver: false,
    started: false,
    ufoTimer: 20000,
    startTime: Date.now(),
    particles: [],
    aiDisabled: false,
    keys: new Set(),
    lastEnemyShot: 0,
  };
}

export function SpaceInvadersGame() {
  const { recordGame, checkAchievements, bestScore, navigate } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, getActionWeight, getTraitValue, recordPlayerAction } = useAIDemo('spaceinvaders');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gsRef = useRef<GS>(createState(1));
  const hudSyncRef = useRef(0);
  const aiEnabledRef = useRef(aiDemoMode);
  const [displayScore, setDisplayScore] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'gameover'>('ready');
  const canvasSize = useMobileCanvasSize({ width: W, height: H, reservedVerticalSpace: 315 });
  const best = bestScore('spaceinvaders');

  useEffect(() => {
    aiEnabledRef.current = aiDemoMode;
    if (aiDemoMode) gsRef.current.aiDisabled = false;
  }, [aiDemoMode]);

  const resetGame = useCallback(() => {
    gsRef.current = createState(1);
    hudSyncRef.current = 0;
    setDisplayScore(0);
    setPhase('ready');
  }, []);

  const startRun = useCallback((disableAi = false) => {
    const gs = gsRef.current;
    if (gs.gameOver) return;
    if (disableAi && aiEnabledRef.current) gs.aiDisabled = true;
    if (!gs.started) {
      gs.started = true;
      gs.startTime = Date.now();
      setPhase('playing');
    }
  }, []);

  const shoot = useCallback((manual: boolean) => {
    const gs = gsRef.current;
    if (manual && aiEnabledRef.current) gs.aiDisabled = true;
    startRun(manual);
    if (gs.playerBullet) return;
    recordPlayerAction('shoot', { aggression: 0.7, precision: 0.6 });
    gs.playerBullet = { x: gs.playerX + 14, y: H - 45, vy: -8 };
  }, [recordPlayerAction, startRun]);

  const finishRun = useCallback((gs: GS) => {
    if (gs.gameOver) return;
    gs.gameOver = true;
    const duration = (Date.now() - gs.startTime) / 1000;
    recordGame('spaceinvaders', false, gs.score, duration);
    checkAchievements('spaceinvaders', { score: gs.score, wave: gs.wave, duration });
    setPhase('gameover');
    setDisplayScore(gs.score);
  }, [checkAchievements, recordGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');
    return () => { ctxRef.current = null; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', ' '].includes(event.key)) event.preventDefault();
      const gs = gsRef.current;
      if (['ArrowLeft', 'a'].includes(event.key)) {
        gs.keys.add('ArrowLeft');
        recordPlayerAction('move:left', { precision: 0.62, tempo: 0.54 });
        if (aiEnabledRef.current) gs.aiDisabled = true;
      }
      if (['ArrowRight', 'd'].includes(event.key)) {
        gs.keys.add('ArrowRight');
        recordPlayerAction('move:right', { precision: 0.62, tempo: 0.54 });
        if (aiEnabledRef.current) gs.aiDisabled = true;
      }
      if (event.key === ' ') shoot(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'a'].includes(event.key)) gsRef.current.keys.delete('ArrowLeft');
      if (['ArrowRight', 'd'].includes(event.key)) gsRef.current.keys.delete('ArrowRight');
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [recordPlayerAction, shoot]);

  const aiStep = useCallback((gs: GS) => {
    const alive = gs.invaders.filter((invader) => invader.alive);
    if (!alive.length) return;
    startRun(false);
    const bottomRow = Math.max(...alive.map((invader) => invader.y));
    const targets = alive.filter((invader) => invader.y === bottomRow);
    const target = isAdaptive
      ? targets
        .map((invader) => {
          const band = Math.min(3, Math.max(0, Math.floor(((invader.x + INVADER_W / 2) / W) * 4)));
          return { invader, rank: getActionWeight(`move:band:${band}`) + getActionWeight('shoot') * 0.18 };
        })
        .sort((a, b) => b.rank - a.rank)[0]?.invader ?? targets[Math.floor(targets.length / 2)]
      : targets[Math.floor(targets.length / 2)];
    const tx = target.x + INVADER_W / 2;
    const px = gs.playerX + 14;
    const tolerance = isAdaptive ? 4 + (1 - getTraitValue('precision')) * 10 : 5;
    const moveSpeed = isAdaptive ? 3 + getTraitValue('tempo') * 2 : 4;

    if (px < tx - tolerance) gs.playerX = Math.min(W - 28, gs.playerX + moveSpeed);
    else if (px > tx + tolerance) gs.playerX = Math.max(0, gs.playerX - moveSpeed);

    for (const bullet of gs.enemyBullets) {
      if (Math.abs(bullet.x - px) < 26 + (isAdaptive ? getTraitValue('risk') * 18 : 0) && bullet.y > H - 200) {
        gs.playerX += px < bullet.x ? -moveSpeed : moveSpeed;
        gs.playerX = Math.max(0, Math.min(W - 28, gs.playerX));
      }
    }
    if (Math.abs(px - tx) < 10) shoot(false);
  }, [getActionWeight, getTraitValue, isAdaptive, shoot, startRun]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, gs: GS) => {
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (let index = 0; index < 50; index += 1) {
      const x = (index * 73) % W;
      const y = (index * 137) % H;
      ctx.fillRect(x, y, 1, 1);
    }

    for (const shield of gs.shields) {
      for (let r = 0; r < shield.cells.length; r += 1) {
        for (let c = 0; c < shield.cells[r].length; c += 1) {
          if (!shield.cells[r][c]) continue;
          ctx.fillStyle = '#2e7d32';
          ctx.fillRect(shield.x + c * 5, shield.y + r * 5, 5, 5);
        }
      }
    }

    const colors = ['#ef9a9a', '#ce93d8', '#90caf9'];
    for (const invader of gs.invaders) {
      if (!invader.alive) continue;
      drawInvader(ctx, invader.x, invader.y, invader.type, gs.animFrame, colors[invader.type]);
    }

    if (gs.ufo.active) {
      ctx.fillStyle = '#f44336';
      ctx.beginPath();
      ctx.ellipse(gs.ufo.x + 15, gs.ufo.y + 6, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8a80';
      ctx.beginPath();
      ctx.ellipse(gs.ufo.x + 15, gs.ufo.y + 4, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (gs.playerBullet) {
      ctx.fillStyle = '#ff5';
      ctx.fillRect(gs.playerBullet.x - 1, gs.playerBullet.y, 2, 12);
    }

    ctx.fillStyle = '#f44';
    for (const bullet of gs.enemyBullets) ctx.fillRect(bullet.x - 1, bullet.y, 3, 8);

    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath();
    ctx.moveTo(gs.playerX + 14, H - 55);
    ctx.lineTo(gs.playerX + 28, H - 42);
    ctx.lineTo(gs.playerX, H - 42);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(gs.playerX + 2, H - 45, 24, 8);

    for (const particle of gs.particles) {
      ctx.globalAlpha = particle.life / 30;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, 2, 2);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${gs.score}`, 5, 18);
    ctx.textAlign = 'right';
    ctx.fillText(`Wave:${gs.wave}  Lives:${'♥'.repeat(gs.lives)}`, W - 5, 18);

    if (aiEnabledRef.current && !gs.aiDisabled && !gs.gameOver) {
      ctx.fillStyle = 'rgba(0,200,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 20, 4, 40, 18, 5);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AI', W / 2, 16);
      ctx.textAlign = 'left';
    }
  }, []);

  const step = useCallback((dtMs: number, now: number) => {
    const gs = gsRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;

    if (!gs.gameOver) {
      if (aiEnabledRef.current && !gs.aiDisabled) aiStep(gs);
      else if (gs.started) {
        if (gs.keys.has('ArrowLeft')) gs.playerX = Math.max(0, gs.playerX - 4);
        if (gs.keys.has('ArrowRight')) gs.playerX = Math.min(W - 28, gs.playerX + 4);
      }
    }

    if (gs.started && !gs.gameOver) {
      gs.sweepTimer += dtMs;
      gs.animTimer += dtMs;
      if (gs.animTimer > 500) {
        gs.animTimer = 0;
        gs.animFrame ^= 1;
      }

      const alive = gs.invaders.filter((invader) => invader.alive);
      if (gs.sweepTimer >= gs.sweepSpeed) {
        gs.sweepTimer = 0;
        const hitWall = alive.some((invader) => (gs.sweepDx > 0 && invader.x + INVADER_W >= W - 5) || (gs.sweepDx < 0 && invader.x <= 5));
        if (hitWall) {
          gs.sweepDx = -gs.sweepDx;
          for (const invader of alive) invader.y += 12;
          if (alive.length < INVADER_COLS * INVADER_ROWS * 0.5) gs.sweepSpeed = Math.max(15, gs.sweepSpeed * 0.8);
        } else {
          for (const invader of alive) invader.x += gs.sweepDx * 8;
        }
      }

      if (gs.playerBullet) {
        gs.playerBullet.y += gs.playerBullet.vy;
        if (gs.playerBullet.y < 0) gs.playerBullet = null;
        else {
          for (const invader of alive) {
            if (gs.playerBullet && gs.playerBullet.x > invader.x && gs.playerBullet.x < invader.x + INVADER_W && gs.playerBullet.y < invader.y + INVADER_H && gs.playerBullet.y > invader.y) {
              invader.alive = false;
              gs.score += INVADER_SCORES[invader.type];
              gs.playerBullet = null;
              for (let index = 0; index < 5; index += 1) gs.particles.push({ x: invader.x + INVADER_W / 2, y: invader.y + INVADER_H / 2, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 30, color: '#ff0' });
              break;
            }
          }
        }
      }

      const shootInterval = Math.max(800, 1500 - gs.wave * 100);
      if (now - gs.lastEnemyShot > shootInterval) {
        gs.lastEnemyShot = now;
        const bottomByCol: Record<number, Invader> = {};
        for (const invader of alive) {
          const col = Math.round((invader.x - 20) / (INVADER_W + INVADER_GAP_X));
          if (!bottomByCol[col] || invader.y > bottomByCol[col].y) bottomByCol[col] = invader;
        }
        const shooters = Object.values(bottomByCol);
        if (shooters.length) {
          const shooter = shooters[Math.floor(Math.random() * shooters.length)];
          gs.enemyBullets.push({ x: shooter.x + INVADER_W / 2, y: shooter.y + INVADER_H, vy: 4 + gs.wave * 0.5 });
        }
      }

      for (let index = gs.enemyBullets.length - 1; index >= 0; index -= 1) {
        const bullet = gs.enemyBullets[index];
        bullet.y += bullet.vy;
        if (bullet.y > H) {
          gs.enemyBullets.splice(index, 1);
          continue;
        }
        if (bullet.x > gs.playerX && bullet.x < gs.playerX + 28 && bullet.y > H - 55 && bullet.y < H - 42) {
          gs.lives -= 1;
          gs.enemyBullets.splice(index, 1);
          if (gs.lives <= 0) finishRun(gs);
          continue;
        }
      }

      gs.ufoTimer -= dtMs;
      if (gs.ufoTimer <= 0) {
        gs.ufoTimer = 20000;
        gs.ufo.active = true;
        gs.ufo.x = -30;
        gs.ufo.score = [50, 100, 200, 300][Math.floor(Math.random() * 4)];
      }
      if (gs.ufo.active) {
        gs.ufo.x += 2;
        if (gs.ufo.x > W + 30) gs.ufo.active = false;
      }

      for (let index = gs.particles.length - 1; index >= 0; index -= 1) {
        const particle = gs.particles[index];
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 1;
        if (particle.life <= 0) gs.particles.splice(index, 1);
      }

      if (alive.length === 0) {
        const carryScore = gs.score;
        gsRef.current = createState(gs.wave + 1);
        gsRef.current.score = carryScore;
        gsRef.current.started = true;
      }

      if (alive.some((invader) => invader.y + INVADER_H > H - 55)) finishRun(gs);
    }

    draw(ctx, gs);
    hudSyncRef.current += dtMs;
    if (hudSyncRef.current >= 120 || !gs.started || gs.gameOver) {
      hudSyncRef.current = 0;
      setDisplayScore(gs.score);
      if (!gs.started && phase !== 'ready') setPhase('ready');
      if (gs.started && !gs.gameOver && phase !== 'playing') setPhase('playing');
      if (gs.gameOver && phase !== 'gameover') setPhase('gameover');
    }
  }, [aiStep, draw, finishRun, phase]);

  useGameLoop(step);

  return (
    <GameWrapper
      title="Space Invaders"
      score={displayScore}
      onRestart={resetGame}
      footer={best > 0 ? <div className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Best score: {best.toLocaleString()}</div> : undefined}
      controls={(
        <MobileControlBar
          items={[
            { id: 'left', label: 'LEFT', onPress: () => { startRun(true); gsRef.current.keys.add('ArrowLeft'); recordPlayerAction('move:left', { precision: 0.62, tempo: 0.54 }); }, onRelease: () => gsRef.current.keys.delete('ArrowLeft') },
            { id: 'fire', label: 'FIRE', onPress: () => shoot(true), tone: 'danger' },
            { id: 'right', label: 'RIGHT', onPress: () => { startRun(true); gsRef.current.keys.add('ArrowRight'); recordPlayerAction('move:right', { precision: 0.62, tempo: 0.54 }); }, onRelease: () => gsRef.current.keys.delete('ArrowRight') },
          ]}
          hint="Hold LEFT or RIGHT to slide the ship, tap FIRE to start or shoot. The shared overlay now handles the first launch and restarts."
        />
      )}
    >
      <div className="relative flex w-full justify-center">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="game-canvas rounded-[28px] border border-white/10 bg-black/20 shadow-2xl"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        />
        <GameOverlay
          visible={phase !== 'playing'}
          eyebrow={phase === 'ready' ? 'Touch Run' : 'Earth Fell'}
          title={phase === 'ready' ? 'Defend The First Wave' : 'Reset The Defense'}
          subtitle={phase === 'ready'
            ? 'Space Invaders now uses the same start, restart, and hub flow as the other arcade games.'
            : 'Restart begins wave one again with the shared mobile shell and controls.'}
          score={displayScore}
          best={best}
          primaryLabel={phase === 'ready' ? 'Start Wave' : 'Play Again'}
          onPrimary={phase === 'ready' ? () => startRun(false) : resetGame}
          secondaryLabel="Back to Hub"
          onSecondary={() => navigate('menu')}
        />
      </div>
    </GameWrapper>
  );
}
