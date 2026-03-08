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
const H = 300;
const GROUND_Y = 240;
const GRAVITY = 0.48;
const JUMP_POWER = -12;
const BASE_SPEED = 4.1;
const BLOB_X = 70;
const BLOB_R = 18;

interface Obstacle { x: number; y: number; w: number; h: number; type: 'spike' | 'wall' | 'gate_low' | 'gate_high'; }
interface Portal { x: number; color: string; }
interface Particle { x: number; y: number; vx: number; vy: number; color: string; life: number; size: number; }
interface Star { x: number; y: number; brightness: number; }
interface GS {
  blobY: number;
  blobVY: number;
  onGround: boolean;
  ducking: boolean;
  speed: number;
  obstacles: Obstacle[];
  portals: Portal[];
  particles: Particle[];
  stars: Star[];
  score: number;
  distance: number;
  alive: boolean;
  started: boolean;
  frame: number;
  spawnTimer: number;
  portalTimer: number;
  aiDisabled: boolean;
  bestSession: number;
  duckPressed: boolean;
  glowPhase: number;
}

function makeStars(): Star[] {
  return Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * (GROUND_Y - 20), brightness: 0.3 + Math.random() * 0.7 }));
}

function initGs(): GS {
  return {
    blobY: GROUND_Y - BLOB_R,
    blobVY: 0,
    onGround: true,
    ducking: false,
    speed: BASE_SPEED,
    obstacles: [],
    portals: [],
    particles: [],
    stars: makeStars(),
    score: 0,
    distance: 0,
    alive: true,
    started: false,
    frame: 0,
    spawnTimer: 60,
    portalTimer: 180,
    aiDisabled: false,
    bestSession: 0,
    duckPressed: false,
    glowPhase: 0,
  };
}

export function NeonBlobDash() {
  const { recordGame, checkAchievements, bestScore, navigate } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, getActionWeight, getTraitValue, recordPlayerAction } = useAIDemo('neonblob');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gsRef = useRef<GS>(initGs());
  const hudSyncRef = useRef(0);
  const aiEnabledRef = useRef(aiDemoMode);
  const [displayScore, setDisplayScore] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'gameover'>('ready');
  const canvasSize = useMobileCanvasSize({ width: W, height: H, reservedVerticalSpace: 300 });
  const best = bestScore('neonblob');

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

  const jump = useCallback((manual: boolean) => {
    const gs = gsRef.current;
    if (!gs.alive) return;
    if (manual && aiEnabledRef.current) gs.aiDisabled = true;
    if (!gs.started) {
      gs.started = true;
      setPhase('playing');
    }
    if (gs.onGround) {
      recordPlayerAction('jump', { aggression: 0.6, risk: 0.52, tempo: 0.6 });
      gs.blobVY = JUMP_POWER;
      gs.onGround = false;
      for (let index = 0; index < 8; index += 1) {
        gs.particles.push({ x: BLOB_X, y: gs.blobY + BLOB_R, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 3, color: '#00ffff', life: 0.5, size: 4 });
      }
    }
  }, [recordPlayerAction]);

  const duck = useCallback((active: boolean, manual = true) => {
    const gs = gsRef.current;
    if (manual && active && aiEnabledRef.current) gs.aiDisabled = true;
    if (active) recordPlayerAction('duck', { precision: 0.64, risk: 0.36 });
    gs.duckPressed = active;
    gs.ducking = active && gs.onGround;
  }, [recordPlayerAction]);

  const die = useCallback((gs: GS) => {
    gs.alive = false;
    for (let index = 0; index < 20; index += 1) {
      gs.particles.push({ x: BLOB_X, y: gs.blobY, vx: (Math.random() - 0.5) * 10, vy: -Math.random() * 8, color: `hsl(${Math.random() * 60 + 160}, 100%, 60%)`, life: 1, size: 5 });
    }
    recordGame('neonblob', false, gs.score * 10, gs.frame / 60);
    checkAchievements('neonblob', { score: gs.score });
    setPhase('gameover');
    setDisplayScore(gs.score * 10);
  }, [checkAchievements, recordGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');
    return () => {
      ctxRef.current = null;
    };
  }, []);

  const spawnObstacle = useCallback((gs: GS) => {
    const rand = Math.random();
    if (rand < 0.4) {
      const h = 20 + Math.random() * 30;
      gs.obstacles.push({ x: W + 20, y: GROUND_Y - h, w: 24, h, type: 'spike' });
    } else if (rand < 0.65) {
      const h = 30 + Math.random() * 40;
      gs.obstacles.push({ x: W + 20, y: GROUND_Y - h, w: 18, h, type: 'wall' });
    } else if (rand < 0.8 && gs.score > 5) {
      gs.obstacles.push({ x: W + 20, y: GROUND_Y - 32, w: 40, h: 20, type: 'gate_low' });
    } else if (gs.score > 10) {
      gs.obstacles.push({ x: W + 20, y: GROUND_Y - 80, w: 40, h: 60, type: 'gate_high' });
    } else {
      const h = 20 + Math.random() * 30;
      gs.obstacles.push({ x: W + 20, y: GROUND_Y - h, w: 24, h, type: 'spike' });
    }
  }, []);

  const aiDecide = useCallback((gs: GS) => {
    if (!aiEnabledRef.current || gs.aiDisabled || !gs.alive) return;
    if (!gs.started) {
      gs.started = true;
      setPhase('playing');
      return;
    }

    const lookAhead = gs.speed * 18;
    const blobRight = BLOB_X + BLOB_R;
    for (const obstacle of gs.obstacles) {
      if (obstacle.x - lookAhead > blobRight) continue;
      if (obstacle.x + obstacle.w < BLOB_X - BLOB_R) continue;

      if (obstacle.type === 'spike' || obstacle.type === 'wall') {
        const jumpEarly = !isAdaptive || getActionWeight('jump') >= getActionWeight('duck') || getTraitValue('risk') > 0.48;
        if (gs.onGround && jumpEarly) jump(false);
      } else if (obstacle.type === 'gate_low') {
        duck(true, false);
      } else if (obstacle.type === 'gate_high' && gs.onGround) {
        jump(false);
      }
      break;
    }
  }, [duck, getActionWeight, getTraitValue, isAdaptive, jump]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, gs: GS, ts: number) => {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0015');
    bg.addColorStop(1, '#0f001a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    gs.stars.forEach((star) => {
      const twinkle = 0.5 + 0.5 * Math.sin(ts / 800 + star.x);
      ctx.fillStyle = `rgba(255,255,255,${star.brightness * twinkle})`;
      ctx.fillRect(star.x, star.y, 1.5, 1.5);
    });

    ctx.fillStyle = '#220044';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = `hsl(${270 + Math.sin(gs.glowPhase) * 30}, 100%, 60%)`;
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    gs.portals.forEach((portal) => {
      ctx.save();
      ctx.translate(portal.x, GROUND_Y - 50);
      const radius = 25 + 5 * Math.sin(ts / 300);
      ctx.strokeStyle = portal.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = portal.color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.6, radius, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    gs.obstacles.forEach((obstacle) => {
      ctx.save();
      if (obstacle.type === 'spike') {
        ctx.fillStyle = '#ff4444';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(obstacle.x, obstacle.y + obstacle.h);
        ctx.lineTo(obstacle.x + obstacle.w / 2, obstacle.y);
        ctx.lineTo(obstacle.x + obstacle.w, obstacle.y + obstacle.h);
        ctx.closePath();
        ctx.fill();
      } else if (obstacle.type === 'wall') {
        ctx.fillStyle = '#ff8800';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 8;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      } else if (obstacle.type === 'gate_low') {
        ctx.fillStyle = '#ff00ff';
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 12;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      } else {
        ctx.fillStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 12;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      }
      ctx.restore();
    });

    gs.particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    const blobHeight = gs.ducking ? BLOB_R * 0.6 : BLOB_R;
    const hue = (180 + Math.sin(gs.glowPhase) * 60) % 360;
    ctx.save();
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
    ctx.shadowBlur = 20;
    ctx.fillStyle = `hsl(${hue}, 100%, 55%)`;
    ctx.beginPath();
    ctx.ellipse(BLOB_X, gs.blobY, BLOB_R, blobHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(BLOB_X - BLOB_R * 0.3, gs.blobY - blobHeight * 0.3, BLOB_R * 0.35, blobHeight * 0.3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, 28);
    ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`Score: ${gs.score}`, 8, 19);
    ctx.fillStyle = '#aaa';
    ctx.fillText(`Best: ${gs.bestSession}`, 120, 19);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Speed: ${gs.speed.toFixed(1)}`, 230, 19);

    if (aiEnabledRef.current && !gs.aiDisabled && gs.alive) {
      ctx.fillStyle = 'rgba(0,200,255,0.8)';
      ctx.fillRect(W - 44, 4, 40, 18);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('AI', W - 8, 17);
      ctx.textAlign = 'left';
    }
  }, []);

  const step = useCallback((_: number, ts: number) => {
    const gs = gsRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;

    gs.frame += 1;
    gs.glowPhase += 0.08;
    aiDecide(gs);

    if (gs.alive && gs.started) {
      gs.distance += gs.speed;
      gs.score = Math.floor(gs.distance / 50);
      gs.speed = BASE_SPEED + gs.score * 0.015;

      if (!gs.onGround) {
        gs.blobVY += GRAVITY;
        gs.blobY += gs.blobVY;
      }

      const groundY = GROUND_Y - (gs.ducking ? BLOB_R * 0.6 : BLOB_R);
      if (gs.blobY >= groundY) {
        gs.blobY = groundY;
        gs.blobVY = 0;
        gs.onGround = true;
        gs.ducking = gs.duckPressed;
      }

      gs.spawnTimer -= 1;
      if (gs.spawnTimer <= 0) {
        spawnObstacle(gs);
        gs.spawnTimer = Math.max(42, Math.floor(78 + Math.random() * 64 - gs.score * 0.2));
      }

      gs.portalTimer -= 1;
      if (gs.portalTimer <= 0) {
        gs.portals.push({ x: W + 20, color: `hsl(${Math.random() * 360}, 100%, 60%)` });
        gs.portalTimer = 300 + Math.floor(Math.random() * 200);
      }

      gs.obstacles = gs.obstacles.filter((obstacle) => {
        obstacle.x -= gs.speed;
        return obstacle.x + obstacle.w > -20;
      });
      gs.portals = gs.portals.filter((portal) => {
        portal.x -= gs.speed * 0.8;
        return portal.x > -30;
      });

      const blobLeft = BLOB_X - BLOB_R + 4;
      const blobRight = BLOB_X + BLOB_R - 4;
      const blobTop = gs.blobY - (gs.ducking ? BLOB_R * 0.6 : BLOB_R) + 4;
      const blobBottom = gs.blobY + (gs.ducking ? BLOB_R * 0.6 : BLOB_R) - 4;

      for (const obstacle of gs.obstacles) {
        if (obstacle.x + obstacle.w < blobLeft || obstacle.x > blobRight) continue;
        if ((obstacle.type === 'spike' || obstacle.type === 'wall') && blobTop < obstacle.y + obstacle.h && blobBottom > obstacle.y) {
          die(gs);
          break;
        }
        if (obstacle.type === 'gate_low' && !gs.ducking && blobBottom > obstacle.y && blobTop < obstacle.y + obstacle.h) {
          die(gs);
          break;
        }
        if (obstacle.type === 'gate_high' && gs.onGround && blobBottom > obstacle.y && blobTop < obstacle.y + obstacle.h) {
          die(gs);
          break;
        }
      }

      gs.particles = gs.particles.filter((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.2;
        particle.life -= 0.04;
        return particle.life > 0;
      });

      if (gs.frame % 3 === 0) {
        gs.particles.push({ x: BLOB_X - BLOB_R, y: gs.blobY, vx: -2, vy: (Math.random() - 0.5) * 1, color: `hsl(${180 + Math.sin(gs.glowPhase) * 60}, 100%, 60%)`, life: 0.4, size: 6 });
      }
      if (gs.score > gs.bestSession) gs.bestSession = gs.score;
    }

    draw(ctx, gs, ts);

    hudSyncRef.current += 16.67;
    if (hudSyncRef.current >= 120 || !gs.alive || !gs.started) {
      hudSyncRef.current = 0;
      setDisplayScore(gs.score * 10);
      if (!gs.started && phase !== 'ready') setPhase('ready');
      if (gs.started && gs.alive && phase !== 'playing') setPhase('playing');
      if (!gs.alive && phase !== 'gameover') setPhase('gameover');
    }
  }, [aiDecide, die, draw, phase, spawnObstacle]);

  useGameLoop(step);

  return (
    <GameWrapper
      title="Neon Pulse Run"
      score={displayScore}
      onRestart={resetGame}
      footer={best > 0 ? <div className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Best score: {best.toLocaleString()}</div> : undefined}
      controls={(
        <MobileControlBar
          items={[
            { id: 'jump', label: 'JUMP', onPress: () => jump(true), tone: 'accent', wide: true },
            { id: 'duck', label: 'DUCK', onPress: () => duck(true), onRelease: () => duck(false), tone: 'danger', wide: true },
          ]}
          hint="Jump over spikes and high walls, duck under low gates. The run now opens and restarts through the shared mobile overlay."
        />
      )}
    >
      <div className="relative flex w-full justify-center">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={() => jump(true)}
          className="game-canvas rounded-[28px] border border-white/10 bg-black/20 shadow-2xl"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        />
        <GameOverlay
          visible={phase !== 'playing'}
          eyebrow={phase === 'ready' ? 'Touch Run' : 'Pulse Lost'}
          title={phase === 'ready' ? 'Ride The Pulse Lane' : 'Reboot The Pulse'}
          subtitle={phase === 'ready'
            ? 'The same shared start, restart, and hub flow now wraps Neon Pulse Run too.'
            : 'Restart launches a clean run. Use the shared Jump and Duck bar for more reliable thumb control.'}
          score={displayScore}
          best={best}
          primaryLabel={phase === 'ready' ? 'Start Run' : 'Play Again'}
          onPrimary={phase === 'ready' ? () => jump(false) : resetGame}
          secondaryLabel="Back to Hub"
          onSecondary={() => navigate('menu')}
        />
      </div>
    </GameWrapper>
  );
}
