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
const GRAVITY = 0.28;
const TERMINAL = 7;
const FLAP_VY = -7;
const PIPE_W = 52;
const PIPE_GAP = 175;
const PIPE_SPEED_BASE = 1.8;

interface Pipe {
  x: number;
  gapY: number;
  speed: number;
  oscPhase: number;
  oscillating: boolean;
  passed: boolean;
}

interface GS {
  birdY: number;
  birdVY: number;
  birdX: number;
  wingFrame: number;
  wingTimer: number;
  pipes: Pipe[];
  score: number;
  multiplierText: string;
  multiplierTimer: number;
  spawnTimer: number;
  gameState: 'start' | 'playing' | 'dead';
  startTime: number;
  aiDisabled: boolean;
  bgLayers: Array<{ x: number; speed: number }>;
}

function createGameState(): GS {
  return {
    birdY: H / 2,
    birdVY: 0,
    birdX: 80,
    wingFrame: 0,
    wingTimer: 0,
    pipes: [],
    score: 0,
    multiplierText: '',
    multiplierTimer: 0,
    spawnTimer: 0,
    gameState: 'start',
    startTime: Date.now(),
    aiDisabled: false,
    bgLayers: [{ x: 0, speed: 0.3 }, { x: 0, speed: 0.6 }, { x: 0, speed: 1 }],
  };
}

export function FlappyGame() {
  const { recordGame, bestScore, navigate } = useApp();
  const { isEnabled: aiDemoMode, getActionWeight, getTraitValue, recordPlayerAction } = useAIDemo('flappy');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gsRef = useRef<GS>(createGameState());
  const hudSyncRef = useRef(0);
  const aiEnabledRef = useRef(aiDemoMode);
  const [displayScore, setDisplayScore] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'gameover'>('ready');
  const canvasSize = useMobileCanvasSize({ width: W, height: H, reservedVerticalSpace: 270 });
  const best = bestScore('flappy');

  useEffect(() => {
    aiEnabledRef.current = aiDemoMode;
    if (aiDemoMode) gsRef.current.aiDisabled = false;
  }, [aiDemoMode]);

  const resetGame = useCallback(() => {
    gsRef.current = createGameState();
    hudSyncRef.current = 0;
    setDisplayScore(0);
    setPhase('ready');
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
    gs.birdVY = FLAP_VY;
  }, []);

  const finishRun = useCallback((gs: GS) => {
    if (gs.gameState === 'dead') return;
    gs.gameState = 'dead';
    const duration = (Date.now() - gs.startTime) / 1000;
    recordGame('flappy', false, gs.score, duration, { score: gs.score, duration });
    setPhase('gameover');
    setDisplayScore(gs.score);
  }, [recordGame]);

  const handleManualFlap = useCallback(() => {
    if (phase === 'gameover') return;
    recordPlayerAction('flap', { aggression: 0.58, risk: 0.52, precision: 0.62 });
    startRun(true);
  }, [phase, recordPlayerAction, startRun]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');
    return () => {
      ctxRef.current = null;
    };
  }, []);

  const aiStep = useCallback((gs: GS) => {
    if (gs.gameState === 'dead') return;
    if (gs.gameState === 'start') {
      startRun(false);
      return;
    }

    const nextPipe = gs.pipes.find((pipe) => pipe.x + PIPE_W > gs.birdX - 5);
    if (!nextPipe) {
      // No pipe ahead — gently hold center height
      if (gs.birdY > H * 0.55 && gs.birdVY >= 0) startRun(false);
      return;
    }

    const gapCenter = nextPipe.oscillating
      ? nextPipe.gapY + Math.sin(nextPipe.oscPhase) * 25
      : nextPipe.gapY;

    const speed = PIPE_SPEED_BASE + Math.floor(gs.score / 15) * 0.25;
    // Target the center of the pipe opening
    const framesAway = Math.max(1, (nextPipe.x + PIPE_W * 0.5 - gs.birdX) / speed);
    const simFrames = Math.min(framesAway, 80);

    // Simulate trajectory WITHOUT flapping
    let simY = gs.birdY;
    let simVY = gs.birdVY;
    for (let i = 0; i < simFrames; i++) {
      simVY = Math.min(TERMINAL, simVY + GRAVITY);
      simY += simVY;
    }

    // Simulate trajectory WITH an immediate flap
    let simYFlap = gs.birdY;
    let simVYFlap = FLAP_VY;
    for (let i = 0; i < simFrames; i++) {
      simVYFlap = Math.min(TERMINAL, simVYFlap + GRAVITY);
      simYFlap += simVYFlap;
    }

    // Stay within the middle 55% of the gap; don't flap into the ceiling or top pipe
    const margin = PIPE_GAP * 0.275;
    const willBeTooLow = simY > gapCenter + margin;
    const flapWouldOvershoot = simYFlap < gapCenter - margin || gs.birdY < 28;

    if (willBeTooLow && !flapWouldOvershoot) startRun(false);
  }, [startRun]);

  const render = useCallback((ctx: CanvasRenderingContext2D, gs: GS) => {
    const drawParallax = (layer: number, offset: number) => {
      const colors = [['#3a5f7d', '#2a4f6d'], ['#4a7f5d', '#3a6f4d'], ['#5a6040', '#4a5030']];
      const heights = [120, 70, 40];
      const period = W;
      const ox = -((offset * [0.3, 0.6, 1][layer]) % period);
      for (let pass = 0; pass < 3; pass += 1) {
        const bx = ox + pass * period;
        ctx.beginPath();
        ctx.moveTo(bx, H - 40);
        for (let xi = 0; xi <= W + period; xi += 20) {
          const peak = H - 40 - heights[layer] * 0.5 - heights[layer] * 0.5 * Math.sin((xi + bx * 0.3) / (60 + layer * 30));
          ctx.lineTo(bx + xi, peak);
        }
        ctx.lineTo(bx + W + period, H - 40);
        ctx.fillStyle = colors[layer][pass % 2];
        ctx.fill();
      }
    };

    const drawBird = (x: number, y: number, vy: number, wingFrame: number) => {
      const angle = Math.atan2(vy, 8) * 0.6;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(6, -4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(7, -4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8f00';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(20, -3);
      ctx.lineTo(20, 3);
      ctx.closePath();
      ctx.fill();
      const wingY = wingFrame === 0 ? -6 : wingFrame === 1 ? 0 : 6;
      ctx.fillStyle = '#ffcc02';
      ctx.beginPath();
      ctx.ellipse(-4, wingY, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d1b2e');
    grad.addColorStop(0.6, '#1a3a5c');
    grad.addColorStop(1, '#3a5f2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    for (let index = 0; index < 3; index += 1) drawParallax(index, gs.bgLayers[index].x);
    ctx.fillStyle = '#4a3a10';
    ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = '#6a5a20';
    ctx.fillRect(0, H - 40, W, 6);

    for (const pipe of gs.pipes) {
      const gapY = pipe.oscillating ? pipe.gapY + Math.sin(pipe.oscPhase) * 25 : pipe.gapY;
      const topHeight = gapY - PIPE_GAP / 2;
      const bottomY = gapY + PIPE_GAP / 2;
      ctx.fillStyle = '#2d7d32';
      ctx.fillRect(pipe.x, 0, PIPE_W, topHeight - 8);
      ctx.fillStyle = '#388e3c';
      ctx.fillRect(pipe.x - 4, topHeight - 8, PIPE_W + 8, 16);
      ctx.fillRect(pipe.x, bottomY - 8, PIPE_W, H - bottomY - 32);
      ctx.fillRect(pipe.x - 4, bottomY - 8, PIPE_W + 8, 16);
    }

    drawBird(gs.birdX, gs.birdY, gs.birdVY, gs.wingFrame);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${gs.score}`, W / 2, 60);

    if (gs.multiplierTimer > 0) {
      ctx.fillStyle = '#ffeb3b';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(gs.multiplierText, W / 2, 92);
    }

    if (aiEnabledRef.current && !gs.aiDisabled && gs.gameState !== 'dead') {
      ctx.fillStyle = 'rgba(0,200,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 28, 8, 56, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('AI', W / 2, 23);
    }

    ctx.textAlign = 'left';
  }, []);

  const step = useCallback((dtMs: number) => {
    const gs = gsRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;

    if (aiEnabledRef.current && !gs.aiDisabled && phase !== 'gameover') aiStep(gs);

    if (gs.gameState === 'playing') {
      gs.birdVY = Math.min(TERMINAL, gs.birdVY + GRAVITY);
      gs.birdY += gs.birdVY;
      gs.wingTimer += dtMs;
      if (gs.wingTimer > 100) {
        gs.wingTimer = 0;
        gs.wingFrame = (gs.wingFrame + 1) % 3;
      }

      for (const layer of gs.bgLayers) layer.x += dtMs / 16;

      gs.spawnTimer += dtMs;
      const spawnInterval = Math.max(1400, 2200 - gs.score * 25);
      if (gs.spawnTimer >= spawnInterval) {
        gs.spawnTimer = 0;
        gs.pipes.push({
          x: W + 10,
          gapY: 110 + Math.random() * 220,
          speed: PIPE_SPEED_BASE + Math.floor(gs.score / 15) * 0.25,
          oscPhase: 0,
          oscillating: gs.score > 20,
          passed: false,
        });
      }

      gs.pipes = gs.pipes.filter((pipe) => pipe.x + PIPE_W >= 0);
      for (const pipe of gs.pipes) {
        pipe.x -= pipe.speed;
        if (pipe.oscillating) pipe.oscPhase += (2 * Math.PI) / (1.5 * 60);
        if (!pipe.passed && pipe.x + PIPE_W < gs.birdX) {
          pipe.passed = true;
          const gapY = pipe.oscillating ? pipe.gapY + Math.sin(pipe.oscPhase) * 25 : pipe.gapY;
          const distFromCenter = Math.abs(gs.birdY - gapY);
          let multiplier = 1;
          let multiplierText = '';
          if (distFromCenter < 20) {
            multiplier = 3;
            multiplierText = '3x!';
          } else if (distFromCenter < 60) {
            multiplier = 2;
            multiplierText = '2x';
          }
          gs.score += multiplier;
          if (multiplier > 1) {
            gs.multiplierText = multiplierText;
            gs.multiplierTimer = 1500;
          }
        }

        const gapY = pipe.oscillating ? pipe.gapY + Math.sin(pipe.oscPhase) * 25 : pipe.gapY;
        const topHeight = gapY - PIPE_GAP / 2;
        const bottomY = gapY + PIPE_GAP / 2;
        if (gs.birdX + 10 > pipe.x && gs.birdX - 10 < pipe.x + PIPE_W) {
          if (gs.birdY - 12 < topHeight || gs.birdY + 12 > bottomY) finishRun(gs);
        }
      }

      if (gs.birdY - 12 < 0 || gs.birdY + 12 > H - 40) finishRun(gs);
      if (gs.multiplierTimer > 0) gs.multiplierTimer -= dtMs;
    }

    render(ctx, gs);

    hudSyncRef.current += dtMs;
    if (hudSyncRef.current >= 120 || gs.gameState !== 'playing') {
      hudSyncRef.current = 0;
      setDisplayScore(gs.score);
      if (gs.gameState === 'start' && phase !== 'ready') setPhase('ready');
      if (gs.gameState === 'playing' && phase !== 'playing') setPhase('playing');
    }
  }, [aiStep, finishRun, phase, render]);

  useGameLoop(step);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      handleManualFlap();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleManualFlap]);

  return (
    <GameWrapper
      title="Flappy 2.0"
      score={displayScore}
      onRestart={resetGame}
      controls={(
        <MobileControlBar
          items={[{ id: 'flap', label: 'FLAP', onPress: handleManualFlap, tone: 'accent', wide: true }]}
          hint="Tap the screen or hit FLAP to start, then keep the bird centered through the gaps."
        />
      )}
    >
      <div className="relative flex w-full justify-center">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={handleManualFlap}
          className="game-canvas rounded-[28px] border border-white/10 bg-black/20 shadow-2xl"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        />
        <GameOverlay
          visible={phase !== 'playing'}
          eyebrow={phase === 'ready' ? 'Touch Run' : 'Run Ended'}
          title={phase === 'ready' ? 'Flap Through the Pipe Lane' : 'One More Bird'}
          subtitle={phase === 'ready'
            ? 'The first tap starts instantly. Demo mode can take over from the same overlay.'
            : 'Restart is now a single tap, and Hub always stays in the bottom rail.'}
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
