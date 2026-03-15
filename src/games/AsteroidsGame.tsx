/* eslint-disable react-hooks/immutability */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { GameOverlay } from '../components/GameOverlay';
import { MobileControlBar } from '../components/MobileControlBar';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';
import { useGameLoop } from '../hooks/useGameLoop';
import { useMobileCanvasSize } from '../hooks/useMobileCanvasSize';
import { GamePausedContext } from '../contexts/GamePausedContext';

const W = 320;
const H = 480;
const ASTEROID_RADIUS = [0, 14, 22, 36];
const BULLET_SPEED = 6;
const SHIP_ACCEL = 0.12;
const SHIP_DRAG = 0.985;
const SHIP_ROT_SPEED = 0.048;

interface Vec2 { x: number; y: number; }
interface Ship { pos: Vec2; vel: Vec2; angle: number; alive: boolean; invincible: number; }
interface Bullet { pos: Vec2; vel: Vec2; life: number; }
interface Asteroid { pos: Vec2; vel: Vec2; size: 3 | 2 | 1; angle: number; spin: number; verts: Vec2[]; }
interface UFO { pos: Vec2; vel: Vec2; life: number; shootTimer: number; }
interface Particle { pos: Vec2; vel: Vec2; life: number; maxLife: number; color: string; }

interface GS {
  ship: Ship;
  bullets: Bullet[];
  asteroids: Asteroid[];
  ufo: UFO | null;
  ufoBullets: Bullet[];
  particles: Particle[];
  score: number;
  lives: number;
  wave: number;
  started: boolean;
  gameOver: boolean;
  waveDelay: number;
  keys: Set<string>;
  shootTimer: number;
  aiDisabled: boolean;
}

function wrap(v: Vec2): Vec2 {
  return { x: ((v.x % W) + W) % W, y: ((v.y % H) + H) % H };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function makeAsteroidVerts(n = 10): Vec2[] {
  return Array.from({ length: n }, (_, index) => {
    const angle = (index / n) * Math.PI * 2;
    const radius = 0.7 + Math.random() * 0.3;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function spawnAsteroid(size: 3 | 2 | 1, pos?: Vec2): Asteroid {
  const angle = Math.random() * Math.PI * 2;
  const speed = (4 - size) * 0.5 + Math.random() * 0.35;
  return {
    pos: pos ?? { x: Math.random() * W, y: Math.random() * H },
    vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    size,
    angle: 0,
    spin: (Math.random() - 0.5) * 0.04,
    verts: makeAsteroidVerts(),
  };
}

function spawnParticles(pos: Vec2, count: number, color: string): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    return {
      pos: { ...pos },
      vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      life: 30 + Math.random() * 20,
      maxLife: 50,
      color,
    };
  });
}

function initWave(wave: number, existingAsteroids: Asteroid[] = []) {
  if (existingAsteroids.length > 0) return existingAsteroids;
  return Array.from({ length: Math.min(3 + wave, 10) }, () => {
    let pos: Vec2;
    do {
      pos = { x: Math.random() * W, y: Math.random() * H };
    } while (dist(pos, { x: W / 2, y: H / 2 }) < 80);
    return spawnAsteroid(3, pos);
  });
}

function initGame(): GS {
  return {
    ship: { pos: { x: W / 2, y: H / 2 }, vel: { x: 0, y: 0 }, angle: -Math.PI / 2, alive: true, invincible: 180 },
    bullets: [],
    asteroids: initWave(1),
    ufo: null,
    ufoBullets: [],
    particles: [],
    score: 0,
    lives: 3,
    wave: 1,
    started: false,
    gameOver: false,
    waveDelay: 0,
    keys: new Set(),
    shootTimer: 0,
    aiDisabled: false,
  };
}

function aiControl(
  gs: GS,
  isAdaptive: boolean,
  getActionWeight: (action: string) => number,
  getTraitValue: (trait: 'tempo' | 'precision' | 'aggression' | 'risk' | 'exploration') => number
) {
  const ship = gs.ship;
  if (!ship.alive) return { thrust: false, left: false, right: false, shoot: false };

  let target: Vec2 | null = null;
  let minDistance = Infinity;
  for (const asteroid of gs.asteroids) {
    const distance = dist(ship.pos, asteroid.pos);
    if (distance < minDistance) {
      minDistance = distance;
      target = asteroid.pos;
    }
  }
  if (gs.ufo && dist(ship.pos, gs.ufo.pos) < minDistance) target = gs.ufo.pos;

  let left = false;
  let right = false;
  let thrust = false;
  let shoot = false;

  if (target) {
    const dx = target.x - ship.pos.x;
    const dy = target.y - ship.pos.y;
    const targetAngle = Math.atan2(dy, dx);
    let diff = targetAngle - ship.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const precision = isAdaptive ? getTraitValue('precision') : 0.5;
    const aggression = isAdaptive ? getTraitValue('aggression') : 0.5;
    const shootWindow = 0.12 + (1 - precision) * 0.12;

    if (Math.abs(diff) < shootWindow) shoot = true;
    if (diff > 0.05) right = true;
    else if (diff < -0.05) left = true;

    if (isAdaptive) {
      const leftWeight = getActionWeight('turn:left');
      const rightWeight = getActionWeight('turn:right');
      if (Math.abs(diff) < 0.35) {
        if (leftWeight > rightWeight * 1.08) {
          left = true;
          right = false;
        } else if (rightWeight > leftWeight * 1.08) {
          right = true;
          left = false;
        }
      }
    }

    if (minDistance > 100 - aggression * 30) thrust = true;
  }

  for (const bullet of [...gs.ufoBullets, ...gs.bullets.slice(-3)]) {
    const bulletDistance = dist(ship.pos, bullet.pos);
    if (bulletDistance < 60 + (isAdaptive ? getTraitValue('risk') * 18 : 0)) {
      thrust = true;
      break;
    }
  }

  return { thrust, left, right, shoot };
}

export function AsteroidsGame() {
  const { recordGame, bestScore, navigate, state } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, getActionWeight, getTraitValue, recordPlayerAction } = useAIDemo('asteroids');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gsRef = useRef<GS>(initGame());
  const hudSyncRef = useRef(0);
  const startTimeRef = useRef(0);
  const aiEnabledRef = useRef(aiDemoMode);
  const showParticlesRef = useRef(state.settings.showParticles);
  showParticlesRef.current = state.settings.showParticles;
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'gameover'>('ready');
  const canvasSize = useMobileCanvasSize({ width: W, height: H, reservedVerticalSpace: 310 });
  const best = bestScore('asteroids');

  useEffect(() => {
    aiEnabledRef.current = aiDemoMode;
    if (aiDemoMode) gsRef.current.aiDisabled = false;
  }, [aiDemoMode]);

  const resetGame = useCallback(() => {
    gsRef.current = initGame();
    hudSyncRef.current = 0;
    setScore(0);
    setPhase('ready');
  }, []);

  const startRun = useCallback((disableAi = false) => {
    const gs = gsRef.current;
    if (gs.gameOver) return;
    if (disableAi && aiEnabledRef.current) gs.aiDisabled = true;
    if (!gs.started) {
      gs.started = true;
      startTimeRef.current = Date.now();
      setPhase('playing');
    }
  }, []);

  const setKeyPressed = useCallback((key: string, pressed: boolean) => {
    const gs = gsRef.current;
    if (pressed) gs.keys.add(key);
    else gs.keys.delete(key);
  }, []);

  const pressControl = useCallback((key: string, action: string, traits: Parameters<typeof recordPlayerAction>[1]) => {
    startRun(true);
    recordPlayerAction(action, traits);
    setKeyPressed(key, true);
  }, [recordPlayerAction, setKeyPressed, startRun]);

  const finishRun = useCallback((gs: GS) => {
    if (gs.gameOver) return;
    gs.gameOver = true;
    gs.ship.alive = false;
    const duration = (Date.now() - startTimeRef.current) / 1000;
    recordGame('asteroids', false, gs.score, duration, { score: gs.score, wave: gs.wave, duration });
    setPhase('gameover');
    setScore(gs.score);
  }, [recordGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');
    return () => {
      ctxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowLeft', 'ArrowRight', 'w', 'a', 'd', ' '].includes(event.key)) event.preventDefault();
      if (['ArrowLeft', 'a'].includes(event.key)) pressControl('ArrowLeft', 'turn:left', { precision: 0.62, exploration: 0.55 });
      if (['ArrowRight', 'd'].includes(event.key)) pressControl('ArrowRight', 'turn:right', { precision: 0.62, exploration: 0.55 });
      if (['ArrowUp', 'w'].includes(event.key)) pressControl('ArrowUp', 'thrust', { aggression: 0.56, risk: 0.54, tempo: 0.58 });
      if (event.key === ' ') pressControl(' ', 'shoot', { aggression: 0.68, precision: 0.6 });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'a'].includes(event.key)) setKeyPressed('ArrowLeft', false);
      if (['ArrowRight', 'd'].includes(event.key)) setKeyPressed('ArrowRight', false);
      if (['ArrowUp', 'w'].includes(event.key)) setKeyPressed('ArrowUp', false);
      if (event.key === ' ') setKeyPressed(' ', false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pressControl, setKeyPressed]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, gs: GS) => {
    const drawShip = (ship: Ship) => {
      if (!ship.alive) return;
      if (ship.invincible > 0 && Math.floor(ship.invincible / 4) % 2 === 0) return;
      ctx.save();
      ctx.translate(ship.pos.x, ship.pos.y);
      ctx.rotate(ship.angle + Math.PI / 2);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(8, 10);
      ctx.lineTo(0, 6);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };

    const drawAsteroid = (asteroid: Asteroid) => {
      const radius = ASTEROID_RADIUS[asteroid.size];
      ctx.save();
      ctx.translate(asteroid.pos.x, asteroid.pos.y);
      ctx.rotate(asteroid.angle);
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      asteroid.verts.forEach((vertex, index) => {
        if (index === 0) ctx.moveTo(vertex.x * radius, vertex.y * radius);
        else ctx.lineTo(vertex.x * radius, vertex.y * radius);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };

    const drawUfo = (ufo: UFO) => {
      ctx.save();
      ctx.translate(ufo.pos.x, ufo.pos.y);
      ctx.strokeStyle = '#f0f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -5, 8, 5, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
    };

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let index = 0; index < 40; index += 1) {
      const x = (index * 137.5 % W + W) % W;
      const y = (index * 97.3 % H + H) % H;
      ctx.fillRect(x, y, 1, 1);
    }

    for (const asteroid of gs.asteroids) drawAsteroid(asteroid);
    drawShip(gs.ship);
    if (gs.ufo) drawUfo(gs.ufo);

    ctx.fillStyle = '#ff0';
    for (const bullet of gs.bullets) ctx.fillRect(bullet.pos.x - 2, bullet.pos.y - 2, 4, 4);
    ctx.fillStyle = '#f8f';
    for (const bullet of gs.ufoBullets) ctx.fillRect(bullet.pos.x - 2, bullet.pos.y - 2, 4, 4);

    for (const particle of gs.particles) {
      ctx.globalAlpha = particle.life / particle.maxLife;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.pos.x - 1.5, particle.pos.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(`WAVE ${gs.wave}`, 8, 20);
    ctx.fillText('♥'.repeat(gs.lives), W - 80, 20);

    if (aiEnabledRef.current && !gs.aiDisabled && !gs.gameOver) {
      ctx.fillStyle = 'rgba(0,200,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 22, 6, 44, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AI', W / 2, 20);
      ctx.textAlign = 'left';
    }

    if (gs.waveDelay > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`WAVE ${gs.wave + 1}`, W / 2, H / 2);
      ctx.textAlign = 'left';
    }
  }, []);

  const isHubPaused = React.useContext(GamePausedContext);
  const isHubPausedRef = useRef(isHubPaused);
  isHubPausedRef.current = isHubPaused;

  const step = useCallback(() => {
    const gs = gsRef.current;
    const ctx = ctxRef.current;
    if (!ctx || isHubPausedRef.current) return;

    if (!gs.gameOver && aiEnabledRef.current && !gs.aiDisabled) {
      startRun(false);
      const ai = aiControl(gs, isAdaptive, getActionWeight, getTraitValue);
      if (ai.left) gs.keys.add('ArrowLeft'); else gs.keys.delete('ArrowLeft');
      if (ai.right) gs.keys.add('ArrowRight'); else gs.keys.delete('ArrowRight');
      if (ai.thrust) gs.keys.add('ArrowUp'); else gs.keys.delete('ArrowUp');
      if (ai.shoot) gs.keys.add(' '); else gs.keys.delete(' ');
    }

    if (gs.started && !gs.gameOver) {
      const ship = gs.ship;
      const thrustKey = gs.keys.has('ArrowUp');
      const leftKey = gs.keys.has('ArrowLeft');
      const rightKey = gs.keys.has('ArrowRight');
      const shootKey = gs.keys.has(' ');

      if (gs.waveDelay > 0) {
        gs.waveDelay -= 1;
        if (gs.waveDelay === 0) {
          gs.wave += 1;
          gs.asteroids = initWave(gs.wave);
          ship.pos = { x: W / 2, y: H / 2 };
          ship.vel = { x: 0, y: 0 };
          ship.invincible = 120;
        }
      }

      if (ship.alive) {
        if (leftKey) ship.angle -= SHIP_ROT_SPEED;
        if (rightKey) ship.angle += SHIP_ROT_SPEED;
        if (thrustKey) {
          ship.vel.x += Math.cos(ship.angle) * SHIP_ACCEL;
          ship.vel.y += Math.sin(ship.angle) * SHIP_ACCEL;
        }

        ship.vel.x *= SHIP_DRAG;
        ship.vel.y *= SHIP_DRAG;
        const speed = Math.hypot(ship.vel.x, ship.vel.y);
        if (speed > 8) {
          ship.vel.x *= 8 / speed;
          ship.vel.y *= 8 / speed;
        }
        ship.pos = wrap({ x: ship.pos.x + ship.vel.x, y: ship.pos.y + ship.vel.y });
        if (ship.invincible > 0) ship.invincible -= 1;

        if (shootKey && gs.shootTimer <= 0 && gs.bullets.length < 6) {
          gs.bullets.push({
            pos: { x: ship.pos.x + Math.cos(ship.angle) * 14, y: ship.pos.y + Math.sin(ship.angle) * 14 },
            vel: { x: ship.vel.x + Math.cos(ship.angle) * BULLET_SPEED, y: ship.vel.y + Math.sin(ship.angle) * BULLET_SPEED },
            life: 50,
          });
          gs.shootTimer = 8;
        }
        if (gs.shootTimer > 0) gs.shootTimer -= 1;
      }

      gs.bullets = gs.bullets.filter((bullet) => bullet.life > 0);
      for (const bullet of gs.bullets) {
        bullet.pos = wrap({ x: bullet.pos.x + bullet.vel.x, y: bullet.pos.y + bullet.vel.y });
        bullet.life -= 1;
      }

      for (const asteroid of gs.asteroids) {
        asteroid.pos = wrap({ x: asteroid.pos.x + asteroid.vel.x, y: asteroid.pos.y + asteroid.vel.y });
        asteroid.angle += asteroid.spin;
      }

      if (!gs.ufo && gs.score >= 500 && Math.random() < 0.002) {
        gs.ufo = { pos: { x: 0, y: Math.random() * H }, vel: { x: 2, y: 0 }, life: 400, shootTimer: 60 };
      }

      if (gs.ufo) {
        const ufo = gs.ufo;
        ufo.pos.x += ufo.vel.x;
        ufo.pos.y += Math.sin(ufo.pos.x * 0.02) * 1.5;
        ufo.life -= 1;
        ufo.shootTimer -= 1;
        if (ufo.shootTimer <= 0) {
          const angle = Math.atan2(ship.pos.y - ufo.pos.y, ship.pos.x - ufo.pos.x) + (Math.random() - 0.5) * 0.5;
          gs.ufoBullets.push({ pos: { ...ufo.pos }, vel: { x: Math.cos(angle) * 4, y: Math.sin(angle) * 4 }, life: 80 });
          ufo.shootTimer = 60;
        }
        if (ufo.life <= 0 || ufo.pos.x > W + 20) gs.ufo = null;
      }

      gs.ufoBullets = gs.ufoBullets.filter((bullet) => bullet.life > 0);
      for (const bullet of gs.ufoBullets) {
        bullet.pos = wrap({ x: bullet.pos.x + bullet.vel.x, y: bullet.pos.y + bullet.vel.y });
        bullet.life -= 1;
      }

      const newAsteroids: Asteroid[] = [];
      const hitAsteroidIdx = new Set<number>();
      const hitBulletIdx = new Set<number>();

      for (let bulletIndex = 0; bulletIndex < gs.bullets.length; bulletIndex += 1) {
        const bullet = gs.bullets[bulletIndex];
        for (let asteroidIndex = 0; asteroidIndex < gs.asteroids.length; asteroidIndex += 1) {
          if (hitAsteroidIdx.has(asteroidIndex)) continue;
          const asteroid = gs.asteroids[asteroidIndex];
          if (dist(bullet.pos, asteroid.pos) < ASTEROID_RADIUS[asteroid.size]) {
            hitAsteroidIdx.add(asteroidIndex);
            hitBulletIdx.add(bulletIndex);
            gs.score += asteroid.size === 3 ? 20 : asteroid.size === 2 ? 50 : 100;
            if (showParticlesRef.current) gs.particles.push(...spawnParticles(asteroid.pos, 8, '#aaa'));
            if (asteroid.size > 1) {
              const size = (asteroid.size - 1) as 2 | 1;
              newAsteroids.push(spawnAsteroid(size, { ...asteroid.pos }));
              newAsteroids.push(spawnAsteroid(size, { ...asteroid.pos }));
            }
          }
        }
      }

      gs.asteroids = gs.asteroids.filter((_, index) => !hitAsteroidIdx.has(index)).concat(newAsteroids);
      gs.bullets = gs.bullets.filter((_, index) => !hitBulletIdx.has(index));

      if (gs.ufo) {
        for (let bulletIndex = 0; bulletIndex < gs.bullets.length; bulletIndex += 1) {
          if (dist(gs.bullets[bulletIndex].pos, gs.ufo.pos) < 18) {
            gs.score += 1000;
            if (showParticlesRef.current) gs.particles.push(...spawnParticles(gs.ufo.pos, 12, '#f0f'));
            gs.ufo = null;
            gs.bullets.splice(bulletIndex, 1);
            break;
          }
        }
      }

      if (ship.alive && ship.invincible <= 0) {
        let hit = false;
        for (const asteroid of gs.asteroids) {
          if (dist(ship.pos, asteroid.pos) < ASTEROID_RADIUS[asteroid.size] - 4) {
            hit = true;
            break;
          }
        }
        if (gs.ufo && dist(ship.pos, gs.ufo.pos) < 18) hit = true;
        for (const bullet of gs.ufoBullets) {
          if (dist(ship.pos, bullet.pos) < 8) {
            hit = true;
            break;
          }
        }

        if (hit) {
          if (showParticlesRef.current) gs.particles.push(...spawnParticles(ship.pos, 15, '#00ff88'));
          gs.lives -= 1;
          gs.ufoBullets = [];
          if (gs.lives <= 0) finishRun(gs);
          else {
            ship.pos = { x: W / 2, y: H / 2 };
            ship.vel = { x: 0, y: 0 };
            ship.invincible = 180;
          }
        }
      }

      for (const particle of gs.particles) {
        particle.pos.x += particle.vel.x;
        particle.pos.y += particle.vel.y;
        particle.vel.x *= 0.95;
        particle.vel.y *= 0.95;
        particle.life -= 1;
      }
      gs.particles = gs.particles.filter((particle) => particle.life > 0);

      if (gs.asteroids.length === 0 && gs.waveDelay === 0 && !gs.gameOver) gs.waveDelay = 120;
    }

    draw(ctx, gs);

    hudSyncRef.current += 16.67;
    if (hudSyncRef.current >= 120 || gs.gameOver || !gs.started) {
      hudSyncRef.current = 0;
      setScore(gs.score);
      if (!gs.started && phase !== 'ready') setPhase('ready');
      if (gs.started && !gs.gameOver && phase !== 'playing') setPhase('playing');
      if (gs.gameOver && phase !== 'gameover') setPhase('gameover');
    }
  }, [draw, finishRun, getActionWeight, getTraitValue, isAdaptive, phase, startRun]);

  useGameLoop(step);

  return (
    <GameWrapper
      title="Asteroids"
      score={score}
      extra={<span style={{ color: '#66bb6a', fontSize: 14 }}>{'▲'.repeat(gsRef.current.lives)}</span>}
      onRestart={resetGame}
      footer={best > 0 ? <div className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Best score: {best.toLocaleString()}</div> : undefined}
      controls={(
        <MobileControlBar
          items={[
            { id: 'left', label: 'LEFT', onPress: () => pressControl('ArrowLeft', 'turn:left', { precision: 0.62, exploration: 0.55 }), onRelease: () => setKeyPressed('ArrowLeft', false) },
            { id: 'thrust', label: 'THRUST', onPress: () => pressControl('ArrowUp', 'thrust', { aggression: 0.56, risk: 0.54, tempo: 0.58 }), onRelease: () => setKeyPressed('ArrowUp', false), tone: 'accent' },
            { id: 'right', label: 'RIGHT', onPress: () => pressControl('ArrowRight', 'turn:right', { precision: 0.62, exploration: 0.55 }), onRelease: () => setKeyPressed('ArrowRight', false) },
            { id: 'fire', label: 'FIRE', onPress: () => pressControl(' ', 'shoot', { aggression: 0.68, precision: 0.6 }), onRelease: () => setKeyPressed(' ', false), tone: 'danger' },
          ]}
          hint="Hold LEFT or RIGHT to rotate, THRUST to accelerate, and tap FIRE to shoot. Any control can start the wave."
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
          eyebrow={phase === 'ready' ? 'Touch Run' : 'Ship Destroyed'}
          title={phase === 'ready' ? 'Clear the First Wave' : 'Respawn the Run'}
          subtitle={phase === 'ready'
            ? 'Asteroids now waits at a ready screen instead of launching cold, and the mobile controls stay fixed in one shared bar.'
            : 'Restart resets the wave and score. Hub stays one tap away if you want to switch games.'}
          score={score}
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
