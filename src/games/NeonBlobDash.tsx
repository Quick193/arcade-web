/* eslint-disable react-hooks/immutability */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { GameOverlay } from '../components/GameOverlay';
import { MobileControlBar } from '../components/MobileControlBar';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';
import { useGameLoop } from '../hooks/useGameLoop';
import { useSfx } from '../hooks/useSfx';
import { useMobileCanvasSize } from '../hooks/useMobileCanvasSize';

const W = 480;
const H = 300;
const GROUND_Y = 240;
const GRAVITY = 0.55;
const JUMP_POWER = -10.5;
const BASE_SPEED = 4.1;
const BLOB_X = 70;
const BLOB_R = 18;

interface Obstacle { x: number; y: number; w: number; h: number; type: 'spike' | 'wall' | 'gate_low' | 'gate_high' | 'ceiling_bar' | 'double_spike'; }
interface Particle { x: number; y: number; vx: number; vy: number; color: string; life: number; size: number; }
interface Star { x: number; y: number; brightness: number; }
interface GS {
  blobY: number;
  blobVY: number;
  onGround: boolean;
  ducking: boolean;
  speed: number;
  obstacles: Obstacle[];
  particles: Particle[];
  stars: Star[];
  score: number;
  distance: number;
  alive: boolean;
  started: boolean;
  frame: number;
  spawnTimer: number;
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
    particles: [],
    stars: makeStars(),
    score: 0,
    distance: 0,
    alive: true,
    started: false,
    frame: 0,
    spawnTimer: 60,
    aiDisabled: false,
    bestSession: 0,
    duckPressed: false,
    glowPhase: 0,
  };
}

export function NeonBlobDash() {
  const { recordGame, checkAchievements, bestScore, navigate } = useApp();
  const sfx = useSfx();
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
      sfx('jump');
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
    sfx('die');
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
    const score = gs.score;

    if (rand < 0.28) {
      // Single spike
      const h = 20 + Math.random() * 30;
      gs.obstacles.push({ x: W + 20, y: GROUND_Y - h, w: 24, h, type: 'spike' });
    } else if (rand < 0.48 && score > 3) {
      // Double spike — two close together, wider jump required
      const h1 = 18 + Math.random() * 22;
      const h2 = 16 + Math.random() * 26;
      gs.obstacles.push({ x: W + 20,      y: GROUND_Y - h1, w: 22, h: h1, type: 'double_spike' });
      gs.obstacles.push({ x: W + 20 + 30, y: GROUND_Y - h2, w: 22, h: h2, type: 'double_spike' });
    } else if (rand < 0.62) {
      // Wall
      const h = 32 + Math.random() * 40;
      gs.obstacles.push({ x: W + 20, y: GROUND_Y - h, w: 18, h, type: 'wall' });
    } else if (rand < 0.76 && score > 5) {
      // Low laser gate — must duck
      gs.obstacles.push({ x: W + 20, y: GROUND_Y - 32, w: 60, h: 8, type: 'gate_low' });
    } else if (rand < 0.88 && score > 10) {
      // High electrified bar near ground — must jump over
      gs.obstacles.push({ x: W + 20, y: GROUND_Y - 60, w: 50, h: 35, type: 'gate_high' });
    } else if (score > 18) {
      // Ceiling bar — hangs from near the top; blob must NOT jump while passing under it
      // (at peak, blob top ≈ 104; ceiling occupies y=60..105 → collision if jumping)
      const barW = 80 + Math.random() * 60;
      gs.obstacles.push({ x: W + 20, y: 55, w: barW, h: 55, type: 'ceiling_bar' });
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

      if (obstacle.type === 'spike' || obstacle.type === 'wall' || obstacle.type === 'double_spike') {
        const jumpEarly = !isAdaptive || getActionWeight('jump') >= getActionWeight('duck') || getTraitValue('risk') > 0.48;
        if (gs.onGround && jumpEarly) jump(false);
      } else if (obstacle.type === 'gate_low') {
        duck(true, false);
      } else if (obstacle.type === 'gate_high' && gs.onGround) {
        jump(false);
      } else if (obstacle.type === 'ceiling_bar') {
        // Stay on ground — do NOT jump
        duck(false, false);
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

    ctx.strokeStyle = 'rgba(100, 0, 200, 0.08)';
    ctx.lineWidth = 1;
    const gridSize = 30;
    for (let gx = 0; gx < W; gx += gridSize) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = 0; gy < H; gy += gridSize) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

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

    gs.obstacles.forEach((obstacle) => {
      ctx.save();
      if (obstacle.type === 'double_spike') {
        // Same as spike but slightly different colour to signal "wider gap needed"
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ff3300';
        ctx.beginPath();
        ctx.moveTo(obstacle.x, obstacle.y + obstacle.h);
        ctx.lineTo(obstacle.x + obstacle.w / 2, obstacle.y);
        ctx.lineTo(obstacle.x + obstacle.w, obstacle.y + obstacle.h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ff8844'; ctx.lineWidth = 1.5; ctx.shadowBlur = 8; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,200,180,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(obstacle.x + obstacle.w / 2, obstacle.y + 2);
        ctx.lineTo(obstacle.x + 2, obstacle.y + obstacle.h - 1);
        ctx.stroke();
      } else if (obstacle.type === 'ceiling_bar') {
        // Horizontal ceiling hazard — hanging electric beam
        const t = Date.now() / 300;
        const pulse = 0.7 + 0.3 * Math.sin(t);
        ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 24 * pulse;
        // Dark background plate
        ctx.fillStyle = '#1a1000';
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
        // Glowing warning stripes
        ctx.fillStyle = `rgba(255,200,0,${0.15 * pulse})`;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
        // Bright top edge
        ctx.strokeStyle = `rgba(255,220,0,${pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(obstacle.x, obstacle.y); ctx.lineTo(obstacle.x + obstacle.w, obstacle.y); ctx.stroke();
        // Electric bottom edge
        ctx.strokeStyle = `rgba(255,180,0,${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.moveTo(obstacle.x, obstacle.y + obstacle.h); ctx.lineTo(obstacle.x + obstacle.w, obstacle.y + obstacle.h); ctx.stroke();
        ctx.setLineDash([]);
        // "STAY LOW" warning label just below the bar
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        ctx.fillText('STAY LOW', obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h + 11);
        ctx.textAlign = 'left';
      } else if (obstacle.type === 'spike') {
        // Sharp triangle with bright red neon glow and outline
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.moveTo(obstacle.x, obstacle.y + obstacle.h);
        ctx.lineTo(obstacle.x + obstacle.w / 2, obstacle.y);
        ctx.lineTo(obstacle.x + obstacle.w, obstacle.y + obstacle.h);
        ctx.closePath();
        ctx.fill();
        // Neon outline
        ctx.strokeStyle = '#ff6666';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 8;
        ctx.stroke();
        // Inner brighter highlight along left face
        ctx.strokeStyle = 'rgba(255,180,180,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(obstacle.x + obstacle.w / 2, obstacle.y + 2);
        ctx.lineTo(obstacle.x + 2, obstacle.y + obstacle.h - 1);
        ctx.stroke();
      } else if (obstacle.type === 'wall') {
        // Solid neon barrier with horizontal scan lines for techy look
        ctx.fillStyle = '#ff6600';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 12;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
        // Scan lines inside
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,200,100,0.5)';
        ctx.lineWidth = 1;
        for (let sy = obstacle.y + 4; sy < obstacle.y + obstacle.h; sy += 5) {
          ctx.beginPath();
          ctx.moveTo(obstacle.x + 1, sy);
          ctx.lineTo(obstacle.x + obstacle.w - 1, sy);
          ctx.stroke();
        }
        // Bright neon border
        ctx.strokeStyle = '#ffaa44';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 6;
        ctx.strokeRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      } else if (obstacle.type === 'gate_low') {
        // Full-screen laser gate with emitter posts — must duck
        const t = Date.now() / 220;
        const pulse = 0.65 + 0.35 * Math.sin(t);
        const beamY = obstacle.y + obstacle.h / 2;
        const postH = GROUND_Y - obstacle.y;
        // Left emitter post
        ctx.fillStyle = '#440033';
        ctx.shadowBlur = 0;
        ctx.fillRect(obstacle.x, obstacle.y, 7, postH);
        // Right emitter post
        ctx.fillRect(obstacle.x + obstacle.w - 7, obstacle.y, 7, postH);
        // Emitter nodes (glowing orbs at top of posts)
        for (const px of [obstacle.x + 3.5, obstacle.x + obstacle.w - 3.5]) {
          ctx.shadowColor = '#ff00ff';
          ctx.shadowBlur = 20 * pulse;
          ctx.fillStyle = `rgba(255, 80, 255, ${pulse})`;
          ctx.beginPath();
          ctx.arc(px, obstacle.y - 4, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        // Beam extends to screen edges for wall-to-wall laser feel
        const beamLeft = Math.min(obstacle.x, 0);
        const beamRight = Math.max(obstacle.x + obstacle.w, W);
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 28 * pulse;
        ctx.strokeStyle = `rgba(255, 0, 255, ${pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(beamLeft, beamY);
        ctx.lineTo(beamRight, beamY);
        ctx.stroke();
        // Wide soft glow halo
        ctx.strokeStyle = `rgba(255, 0, 255, 0.18)`;
        ctx.lineWidth = 16;
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.moveTo(beamLeft, beamY);
        ctx.lineTo(beamRight, beamY);
        ctx.stroke();
        // DUCK label
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ff88ff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DUCK', obstacle.x + obstacle.w / 2, obstacle.y - 12);
        ctx.textAlign = 'left';
      } else {
        // gate_high: electrified low barrier — must jump over
        const t = Date.now() / 230;
        const pulse = 0.65 + 0.35 * Math.sin(t);
        // Body gradient
        const grad = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x, obstacle.y + obstacle.h);
        grad.addColorStop(0, `rgba(0, 255, 180, ${0.85 * pulse})`);
        grad.addColorStop(1, 'rgba(0, 80, 60, 0.85)');
        ctx.fillStyle = grad;
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = 18 * pulse;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
        // Bright top edge
        ctx.strokeStyle = `rgba(180, 255, 240, ${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(obstacle.x, obstacle.y + 1);
        ctx.lineTo(obstacle.x + obstacle.w, obstacle.y + 1);
        ctx.stroke();
        // Dashed electric bottom edge
        ctx.strokeStyle = `rgba(0, 255, 160, 0.6)`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(obstacle.x, obstacle.y + obstacle.h - 1);
        ctx.lineTo(obstacle.x + obstacle.w, obstacle.y + obstacle.h - 1);
        ctx.stroke();
        ctx.setLineDash([]);
        // End emitter posts
        ctx.shadowBlur = 0;
        for (const px of [obstacle.x, obstacle.x + obstacle.w - 5]) {
          ctx.fillStyle = '#003322';
          ctx.fillRect(px, obstacle.y - 6, 5, obstacle.h + 6);
          ctx.shadowColor = '#00ffaa';
          ctx.shadowBlur = 14 * pulse;
          ctx.fillStyle = `rgba(0, 255, 180, ${pulse})`;
          ctx.beginPath();
          ctx.arc(px + 2.5, obstacle.y - 6, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        // JUMP label
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#aaffee';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('JUMP', obstacle.x + obstacle.w / 2, obstacle.y - 14);
        ctx.textAlign = 'left';
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
    // Trail shadow — three fading echoes behind the blob
    for (let ti = 3; ti >= 1; ti -= 1) {
      const trailAlpha = ti === 3 ? 0.08 : ti === 2 ? 0.13 : 0.18;
      const trailX = BLOB_X - ti * 9;
      ctx.save();
      ctx.globalAlpha = trailAlpha;
      ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
      ctx.beginPath();
      ctx.ellipse(trailX, gs.blobY, BLOB_R * (1 - ti * 0.07), blobHeight * (1 - ti * 0.07), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
    ctx.shadowBlur = 20;
    ctx.fillStyle = `hsl(${hue}, 100%, 55%)`;
    ctx.beginPath();
    ctx.ellipse(BLOB_X, gs.blobY, BLOB_R, blobHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    // White highlight streak — diagonal streak across upper-left of blob
    ctx.shadowBlur = 0;
    const streakGrad = ctx.createLinearGradient(
      BLOB_X - BLOB_R * 0.6, gs.blobY - blobHeight * 0.7,
      BLOB_X - BLOB_R * 0.1, gs.blobY - blobHeight * 0.1
    );
    streakGrad.addColorStop(0, 'rgba(255,255,255,0.65)');
    streakGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = streakGrad;
    ctx.beginPath();
    ctx.ellipse(BLOB_X - BLOB_R * 0.28, gs.blobY - blobHeight * 0.32, BLOB_R * 0.38, blobHeight * 0.28, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Small top-left glint dot
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(BLOB_X - BLOB_R * 0.38, gs.blobY - blobHeight * 0.52, 2.5, 0, Math.PI * 2);
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

      gs.obstacles = gs.obstacles.filter((obstacle) => {
        obstacle.x -= gs.speed;
        return obstacle.x + obstacle.w > -20;
      });

      const blobLeft = BLOB_X - BLOB_R + 4;
      const blobRight = BLOB_X + BLOB_R - 4;
      const blobTop = gs.blobY - (gs.ducking ? BLOB_R * 0.6 : BLOB_R) + 4;
      const blobBottom = gs.blobY + (gs.ducking ? BLOB_R * 0.6 : BLOB_R) - 4;

      for (const obstacle of gs.obstacles) {
        if (obstacle.x + obstacle.w < blobLeft || obstacle.x > blobRight) continue;
        if ((obstacle.type === 'spike' || obstacle.type === 'wall' || obstacle.type === 'double_spike') && blobTop < obstacle.y + obstacle.h && blobBottom > obstacle.y) {
          die(gs);
          break;
        }
        if (obstacle.type === 'gate_low' && !gs.ducking && blobBottom > obstacle.y && blobTop < obstacle.y + obstacle.h) {
          die(gs);
          break;
        }
        if (obstacle.type === 'gate_high' && blobBottom > obstacle.y && blobTop < obstacle.y + obstacle.h) {
          die(gs);
          break;
        }
        // ceiling_bar: dangerous only when blob is airborne (jumping)
        if (obstacle.type === 'ceiling_bar' && !gs.onGround && blobTop < obstacle.y + obstacle.h && blobBottom > obstacle.y) {
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
      title="Neon Dash"
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
          eyebrow={phase === 'ready' ? 'Touch Run' : 'Dash Lost'}
          title={phase === 'ready' ? 'Dash Started' : 'Reboot The Dash'}
          subtitle={phase === 'ready'
            ? 'Jump over spikes and walls, duck under laser beams, leap onto platforms.'
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
