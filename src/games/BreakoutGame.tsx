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
const PADDLE_W = 60;
const PADDLE_H = 10;
const BALL_R = 6;
const BRICK_COLS = 8;
const BRICK_ROWS = 5;
const BRICK_W = (W - 20) / BRICK_COLS - 2;
const BRICK_H = 14;
const BRICK_MARGIN_X = 10;
const BRICK_MARGIN_Y = 50;

interface Brick { x: number; y: number; hp: number; maxHp: number; }
interface Ball { x: number; y: number; vx: number; vy: number; trail: { x: number; y: number }[]; }
interface Powerup { x: number; y: number; type: number; vy: number; }
interface Laser { x: number; y: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }
interface GS {
  paddleX: number;
  balls: Ball[];
  bricks: Brick[];
  powerups: Powerup[];
  lasers: Laser[];
  particles: Particle[];
  score: number;
  lives: number;
  level: number;
  ballAttached: boolean;
  gameState: 'start' | 'playing' | 'dead';
  startTime: number;
  growTimer: number;
  shrinkTimer: number;
  pierceTimer: number;
  laserTimer: number;
  multiActive: boolean;
  aiDisabled: boolean;
}

const BRICK_COLORS = [
  ['#ef5350', '#ff8a80'],
  ['#ff7043', '#ffab91'],
  ['#ffca28', '#ffe082'],
  ['#66bb6a', '#a5d6a7'],
  ['#26c6da', '#80deea'],
];

function makeBricks(level: number): Brick[] {
  const bricks: Brick[] = [];
  for (let row = 0; row < BRICK_ROWS; row += 1) {
    for (let col = 0; col < BRICK_COLS; col += 1) {
      const baseHp = row < 2 ? 1 : row < 4 ? 2 : 3;
      const hp = Math.min(baseHp + Math.floor(level / 3), 5);
      bricks.push({
        x: BRICK_MARGIN_X + col * (BRICK_W + 2),
        y: BRICK_MARGIN_Y + row * (BRICK_H + 2),
        hp,
        maxHp: hp,
      });
    }
  }
  return bricks;
}

function createState(level = 1): GS {
  return {
    paddleX: W / 2 - PADDLE_W / 2,
    balls: [{ x: W / 2, y: H - 80, vx: 2, vy: -3, trail: [] }],
    bricks: makeBricks(level),
    powerups: [],
    lasers: [],
    particles: [],
    score: 0,
    lives: 3,
    level,
    ballAttached: true,
    gameState: 'start',
    startTime: Date.now(),
    growTimer: 0,
    shrinkTimer: 0,
    pierceTimer: 0,
    laserTimer: 0,
    multiActive: false,
    aiDisabled: false,
  };
}

export function BreakoutGame() {
  const { recordGame, checkAchievements, bestScore, navigate, state } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, getActionWeight, getTraitValue, recordPlayerAction } = useAIDemo('breakout');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gsRef = useRef<GS>(createState(1));
  const hudSyncRef = useRef(0);
  const aiEnabledRef = useRef(aiDemoMode);
  const showParticlesRef = useRef(state.settings.showParticles);
  showParticlesRef.current = state.settings.showParticles;
  const [displayScore, setDisplayScore] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'gameover'>('ready');
  const canvasSize = useMobileCanvasSize({ width: W, height: H, reservedVerticalSpace: 300 });
  const best = bestScore('breakout');

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

  const spawnParticles = useCallback((x: number, y: number, color: string) => {
    if (!showParticlesRef.current) return;
    const gs = gsRef.current;
    for (let index = 0; index < 7; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      gs.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 40, color });
    }
  }, []);

  const startRun = useCallback((disableAi = false) => {
    const gs = gsRef.current;
    if (disableAi && aiEnabledRef.current) gs.aiDisabled = true;
    if (gs.gameState === 'dead') return;
    if (gs.gameState === 'start') {
      gs.gameState = 'playing';
      gs.startTime = Date.now();
      setPhase('playing');
    }
    if (gs.ballAttached) {
      gs.ballAttached = false;
      gs.balls[0].vx = 2 + Math.random() * 1.2;
      gs.balls[0].vy = -(2.5 + Math.random() * 1);
    }
  }, []);

  const finishRun = useCallback((gs: GS) => {
    if (gs.gameState === 'dead') return;
    gs.gameState = 'dead';
    const duration = (Date.now() - gs.startTime) / 1000;
    recordGame('breakout', false, gs.score, duration);
    checkAchievements('breakout', { score: gs.score, duration });
    setPhase('gameover');
    setDisplayScore(gs.score);
  }, [checkAchievements, recordGame]);

  const updatePaddle = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    const gs = gsRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left) * (W / rect.width);
    const direction = mx < gs.paddleX + PADDLE_W / 2 ? 'move:left' : 'move:right';
    recordPlayerAction(direction, { precision: 0.64, tempo: 0.56 });
    if (aiEnabledRef.current) gs.aiDisabled = true;
    gs.paddleX = Math.max(0, Math.min(W - PADDLE_W, mx - PADDLE_W / 2));
  }, [recordPlayerAction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');
    return () => {
      ctxRef.current = null;
    };
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, gs: GS) => {
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, W, H);

    for (const brick of gs.bricks) {
      const row = Math.round((brick.y - BRICK_MARGIN_Y) / (BRICK_H + 2));
      const colorIndex = Math.min(row, BRICK_COLORS.length - 1);
      const color = brick.hp / brick.maxHp > 0.5 ? BRICK_COLORS[colorIndex][1] : BRICK_COLORS[colorIndex][0];
      ctx.fillStyle = color;
      ctx.fillRect(brick.x, brick.y, BRICK_W, BRICK_H);
      if (brick.maxHp > 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${brick.hp}`, brick.x + BRICK_W / 2, brick.y + BRICK_H - 3);
      }
    }

    for (const particle of gs.particles) {
      ctx.globalAlpha = particle.life / 40;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const powerColors = ['#4fc3f7', '#ff7043', '#ce93d8', '#fff176', '#80cbc4'];
    const powerLabels = ['G', 'S', 'M', 'P', 'L'];
    for (const powerup of gs.powerups) {
      ctx.fillStyle = powerColors[powerup.type];
      ctx.beginPath();
      ctx.arc(powerup.x, powerup.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(powerLabels[powerup.type], powerup.x, powerup.y + 3);
    }

    ctx.strokeStyle = '#f44';
    ctx.lineWidth = 2;
    for (const laser of gs.lasers) {
      ctx.beginPath();
      ctx.moveTo(laser.x, laser.y);
      ctx.lineTo(laser.x, laser.y - 20);
      ctx.stroke();
    }

    const paddleWidth = gs.growTimer > 0 ? PADDLE_W * 1.5 : gs.shrinkTimer > 0 ? PADDLE_W * 0.6 : PADDLE_W;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(gs.paddleX, H - 30, paddleWidth, PADDLE_H, 4);
    ctx.fill();

    for (const ball of gs.balls) {
      for (let index = 0; index < ball.trail.length; index += 1) {
        ctx.globalAlpha = 0.1 + (0.1 * index) / ball.trail.length;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ball.trail[index].x, ball.trail[index].y, BALL_R * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${gs.score}`, 5, 20);
    ctx.textAlign = 'right';
    ctx.fillText(`Lives: ${'♥'.repeat(gs.lives)}  Lv:${gs.level}`, W - 5, 20);

    if (aiEnabledRef.current && !gs.aiDisabled && gs.gameState !== 'dead') {
      ctx.fillStyle = 'rgba(0,200,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 20, 28, 40, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AI', W / 2, 42);
      ctx.textAlign = 'left';
    }
  }, []);

  const aiStep = useCallback((gs: GS) => {
    const ball = gs.balls[0];
    const powerup = gs.powerups[0];
    let targetX = ball?.x ?? W / 2;
    const prefersPowerups = getActionWeight('collect:powerup') > getActionWeight('launch') || (isAdaptive && getTraitValue('exploration') > 0.55);
    if (powerup && powerup.y > H - 150 && prefersPowerups) targetX = powerup.x;
    const paddleCenter = gs.paddleX + PADDLE_W / 2;
    const deadZone = isAdaptive ? 2 + (1 - getTraitValue('precision')) * 8 : 3;
    const speed = isAdaptive ? 4 + getTraitValue('tempo') * 3 : 6;
    if (paddleCenter < targetX - deadZone) gs.paddleX = Math.min(W - PADDLE_W, gs.paddleX + speed);
    else if (paddleCenter > targetX + deadZone) gs.paddleX = Math.max(0, gs.paddleX - speed);
    if (gs.ballAttached) startRun(false);
  }, [getActionWeight, getTraitValue, isAdaptive, startRun]);

  const step = useCallback((dtMs: number) => {
    const gs = gsRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;

    if (aiEnabledRef.current && !gs.aiDisabled && (gs.gameState === 'start' || gs.gameState === 'playing')) aiStep(gs);

    if (gs.gameState === 'playing') {
      if (gs.growTimer > 0) gs.growTimer -= dtMs;
      if (gs.shrinkTimer > 0) gs.shrinkTimer -= dtMs;
      if (gs.pierceTimer > 0) gs.pierceTimer -= dtMs;
      if (gs.laserTimer > 0) gs.laserTimer -= dtMs;

      const paddleWidth = gs.growTimer > 0 ? PADDLE_W * 1.5 : gs.shrinkTimer > 0 ? PADDLE_W * 0.6 : PADDLE_W;
      if (gs.ballAttached) {
        gs.balls[0].x = gs.paddleX + paddleWidth / 2;
        gs.balls[0].y = H - 30 - BALL_R - 2;
      } else {
        for (const ball of gs.balls) {
          ball.trail.unshift({ x: ball.x, y: ball.y });
          if (ball.trail.length > 5) ball.trail.pop();
          ball.x += ball.vx;
          ball.y += ball.vy;

          if (ball.x - BALL_R < 0) {
            ball.x = BALL_R;
            ball.vx = Math.abs(ball.vx);
          }
          if (ball.x + BALL_R > W) {
            ball.x = W - BALL_R;
            ball.vx = -Math.abs(ball.vx);
          }
          if (ball.y - BALL_R < 0) {
            ball.y = BALL_R;
            ball.vy = Math.abs(ball.vy);
          }

          if (
            ball.vy > 0 &&
            ball.y + BALL_R >= H - 30 &&
            ball.y + BALL_R <= H - 20 &&
            ball.x >= gs.paddleX - BALL_R &&
            ball.x <= gs.paddleX + paddleWidth + BALL_R
          ) {
            const rel = (ball.x - (gs.paddleX + paddleWidth / 2)) / (paddleWidth / 2);
            const angle = rel * (Math.PI * 5 / 12);
            const speed = Math.min(7, Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy));
            ball.vx = speed * Math.sin(angle);
            ball.vy = -speed * Math.cos(angle);
            ball.y = H - 30 - BALL_R;
          }

          for (let brickIndex = gs.bricks.length - 1; brickIndex >= 0; brickIndex -= 1) {
            const brick = gs.bricks[brickIndex];
            if (ball.x + BALL_R > brick.x && ball.x - BALL_R < brick.x + BRICK_W && ball.y + BALL_R > brick.y && ball.y - BALL_R < brick.y + BRICK_H) {
              brick.hp -= 1;
              if (brick.hp <= 0) {
                const row = Math.round((brick.y - BRICK_MARGIN_Y) / (BRICK_H + 2));
                const colorIndex = Math.min(row, BRICK_COLORS.length - 1);
                spawnParticles(brick.x + BRICK_W / 2, brick.y + BRICK_H / 2, BRICK_COLORS[colorIndex][0]);
                gs.score += (row + 1) * 10 * gs.level;
                gs.bricks.splice(brickIndex, 1);
                if (Math.random() < 0.2) gs.powerups.push({ x: brick.x + BRICK_W / 2, y: brick.y, type: Math.floor(Math.random() * 5), vy: 2 });
              }
              if (gs.pierceTimer <= 0) {
                const overlapX = Math.min(ball.x + BALL_R - brick.x, brick.x + BRICK_W - (ball.x - BALL_R));
                const overlapY = Math.min(ball.y + BALL_R - brick.y, brick.y + BRICK_H - (ball.y - BALL_R));
                if (overlapX < overlapY) ball.vx = -ball.vx;
                else ball.vy = -ball.vy;
              }
            }
          }

          if (ball.y - BALL_R > H) {
            const index = gs.balls.indexOf(ball);
            gs.balls.splice(index, 1);
          }
        }

        if (gs.balls.length === 0) {
          gs.lives -= 1;
          if (gs.lives <= 0) finishRun(gs);
          else {
            gs.balls = [{ x: W / 2, y: H - 80, vx: 3, vy: -4, trail: [] }];
            gs.ballAttached = true;
          }
        }
      }

      for (let index = gs.powerups.length - 1; index >= 0; index -= 1) {
        const powerup = gs.powerups[index];
        powerup.y += powerup.vy;
        const paddleWidth = gs.growTimer > 0 ? PADDLE_W * 1.5 : gs.shrinkTimer > 0 ? PADDLE_W * 0.6 : PADDLE_W;
        if (powerup.y > H - 30 && powerup.y < H - 20 && powerup.x > gs.paddleX && powerup.x < gs.paddleX + paddleWidth) {
          recordPlayerAction('collect:powerup', { exploration: 0.64, aggression: 0.44 });
          if (powerup.type === 0) gs.growTimer = 10000;
          else if (powerup.type === 1) gs.shrinkTimer = 8000;
          else if (powerup.type === 2 && !gs.multiActive) {
            gs.multiActive = true;
            for (let copy = 0; copy < 2; copy += 1) gs.balls.push({ x: gs.balls[0]?.x || W / 2, y: gs.balls[0]?.y || H - 80, vx: 3 * (copy === 0 ? 1 : -1), vy: -4, trail: [] });
          } else if (powerup.type === 3) gs.pierceTimer = 8000;
          else if (powerup.type === 4) gs.laserTimer = 8000;
          gs.powerups.splice(index, 1);
        } else if (powerup.y > H) gs.powerups.splice(index, 1);
      }

      for (let index = gs.lasers.length - 1; index >= 0; index -= 1) {
        const laser = gs.lasers[index];
        laser.y -= 10;
        for (let brickIndex = gs.bricks.length - 1; brickIndex >= 0; brickIndex -= 1) {
          const brick = gs.bricks[brickIndex];
          if (laser.x > brick.x && laser.x < brick.x + BRICK_W && laser.y > brick.y && laser.y < brick.y + BRICK_H) {
            brick.hp -= 1;
            if (brick.hp <= 0) {
              gs.bricks.splice(brickIndex, 1);
              gs.score += 5 * gs.level;
            }
            gs.lasers.splice(index, 1);
            break;
          }
        }
        if (gs.lasers[index]?.y < 0) gs.lasers.splice(index, 1);
      }

      for (let index = gs.particles.length - 1; index >= 0; index -= 1) {
        const particle = gs.particles[index];
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 1;
        if (particle.life <= 0) gs.particles.splice(index, 1);
      }

      if (gs.bricks.length === 0) {
        const nextLevel = gs.level + 1;
        const carryScore = gs.score;
        gsRef.current = createState(nextLevel);
        gsRef.current.score = carryScore;
        gsRef.current.gameState = 'playing';
      }
    }

    draw(ctx, gs);

    hudSyncRef.current += dtMs;
    if (hudSyncRef.current >= 120 || gs.gameState !== 'playing') {
      hudSyncRef.current = 0;
      setDisplayScore(gs.score);
      if (gs.gameState === 'start' && phase !== 'ready') setPhase('ready');
      if (gs.gameState === 'playing' && phase !== 'playing') setPhase('playing');
      if (gs.gameState === 'dead' && phase !== 'gameover') setPhase('gameover');
    }
  }, [aiStep, draw, finishRun, phase, recordPlayerAction, spawnParticles]);

  useGameLoop(step);

  const handleLaunch = useCallback(() => {
    if (phase === 'gameover') return;
    recordPlayerAction('launch', { aggression: 0.58, tempo: 0.6 });
    startRun(true);
  }, [phase, recordPlayerAction, startRun]);

  const fireLasers = useCallback(() => {
    const gs = gsRef.current;
    if (gs.laserTimer <= 0) return;
    recordPlayerAction('shoot:laser', { aggression: 0.68, precision: 0.58 });
    gs.lasers.push({ x: gs.paddleX + PADDLE_W / 2 - 6, y: H - 30 });
    gs.lasers.push({ x: gs.paddleX + PADDLE_W / 2 + 6, y: H - 30 });
  }, [recordPlayerAction]);

  return (
    <GameWrapper
      title="Breakout"
      score={displayScore}
      onRestart={resetGame}
      footer={best > 0 ? <div className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Best score: {best.toLocaleString()}</div> : undefined}
      controls={(
        <MobileControlBar
          items={[
            { id: 'left', label: 'LEFT', onPress: () => { gsRef.current.paddleX = Math.max(0, gsRef.current.paddleX - 22); if (aiEnabledRef.current) gsRef.current.aiDisabled = true; } },
            { id: 'launch', label: 'LAUNCH', onPress: handleLaunch, tone: 'accent' },
            { id: 'right', label: 'RIGHT', onPress: () => { gsRef.current.paddleX = Math.min(W - PADDLE_W, gsRef.current.paddleX + 22); if (aiEnabledRef.current) gsRef.current.aiDisabled = true; } },
            { id: 'laser', label: 'LASER', onPress: fireLasers, tone: 'danger', disabled: gsRef.current.laserTimer <= 0 },
          ]}
          hint="Drag the paddle on the board for fine control. LAUNCH starts the run, and LASER only lights up when that powerup is active."
        />
      )}
    >
      <div className="relative flex w-full justify-center">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={(event) => {
            updatePaddle(event.clientX);
            handleLaunch();
          }}
          onPointerMove={(event) => updatePaddle(event.clientX)}
          className="game-canvas rounded-[28px] border border-white/10 bg-black/20 shadow-2xl"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        />
        <GameOverlay
          visible={phase !== 'playing'}
          eyebrow={phase === 'ready' ? 'Touch Run' : 'Brick Run Ended'}
          title={phase === 'ready' ? 'Crack the First Wall' : 'Reload the Paddle'}
          subtitle={phase === 'ready'
            ? 'A tap on the board now moves the paddle and launches from the same shared start overlay.'
            : 'Restart resets to level one. Hub and demo mode stay in the shared mobile rail.'}
          score={displayScore}
          best={best}
          primaryLabel={phase === 'ready' ? 'Start Run' : 'Play Again'}
          onPrimary={phase === 'ready' ? () => startRun(false) : resetGame}
          secondaryLabel="Back to Hub"
          onSecondary={() => navigate('menu')}
        />
      </div>
    </GameWrapper>
  );
}
