import React, { useEffect, useRef, useState, useCallback, useContext } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';
import { GamePausedContext } from '../contexts/GamePausedContext';

const W = 320, H = 480;
const PADDLE_W = 10, PADDLE_H = 60;
const BALL_R = 6;
const SCORE_WIN = 7;

type GameMode = 'menu' | '1p' | '2p' | 'tournament';

interface Ball {
  x: number; y: number; vx: number; vy: number;
  trail: Array<{ x: number; y: number }>;
}

interface Powerup {
  x: number; y: number; type: number; active: boolean; timer: number;
}

interface GS {
  p1y: number; p2y: number;
  p1vy: number; p2vy: number;
  balls: Ball[];
  p1Score: number; p2Score: number;
  p1Sets: number; p2Sets: number;
  hitCount: number;
  powerup: Powerup | null;
  powerupTimer: number;
  p1Effect: number; p2Effect: number;
  p1EffectTimer: number; p2EffectTimer: number;
  paused: boolean; gameOver: boolean;
  winner: string;
  lastTime: number;
  mode: GameMode;
  startTime: number;
  aiLagTimer: number;
  aiTargetY: number;
  aiDisabled: boolean;
}

function makeBall(dx = 1): Ball {
  const angle = (Math.random() * 60 - 30) * Math.PI / 180;
  return { x: W / 2, y: H / 2, vx: 4 * dx, vy: 4 * Math.sin(angle), trail: [] };
}

export function PongGame() {
  const { recordGame } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, mode: demoMode, cycleMode, getTraitValue, recordPlayerAction } = useAIDemo('pong');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GS | null>(null);
  const rafRef = useRef<number>(0);
  const [mode, setMode] = useState<GameMode>('menu');
  const [displayScore, setDisplayScore] = useState('0 - 0');
  const [gameOverState, setGameOverState] = useState(false);
  const aiDemoRef = useRef(aiDemoMode);
  aiDemoRef.current = aiDemoMode;
  const aiOnRef = useRef(aiDemoMode);
  aiOnRef.current = aiDemoMode;
  const demoLabel = demoMode === 'adaptive' ? '🧠 Learn Me' : aiDemoMode ? '🤖 Classic AI' : '🎮 Demo Off';
  const isHubPaused = useContext(GamePausedContext);
  const isHubPausedRef = useRef(false);
  isHubPausedRef.current = isHubPaused;

  const initGame = useCallback((m: GameMode) => {
    setMode(m);
    setGameOverState(false);
    gsRef.current = {
      p1y: H / 2 - PADDLE_H / 2, p2y: H / 2 - PADDLE_H / 2,
      p1vy: 0, p2vy: 0,
      balls: [makeBall(1)],
      p1Score: 0, p2Score: 0, p1Sets: 0, p2Sets: 0,
      hitCount: 0, powerup: null, powerupTimer: 15000,
      p1Effect: 0, p2Effect: 0, p1EffectTimer: 0, p2EffectTimer: 0,
      paused: false, gameOver: false, winner: '',
      lastTime: performance.now(), mode: m,
      startTime: Date.now(), aiLagTimer: 0, aiTargetY: H / 2,
      aiDisabled: false,
    };
  }, []);

  useEffect(() => {
    if (mode === 'menu') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const keys: Record<string, boolean> = {};

    function predictBallY(ball: Ball, targetX: number): number {
      let { x, y, vx, vy } = ball;
      for (let i = 0; i < 200; i++) {
        x += vx; y += vy;
        if (y < BALL_R) { y = BALL_R; vy = Math.abs(vy); }
        if (y > H - BALL_R) { y = H - BALL_R; vy = -Math.abs(vy); }
        if ((vx > 0 && x >= targetX) || (vx < 0 && x <= targetX)) return y;
      }
      return H / 2;
    }

    function aiMove(paddleY: number, targetY: number, maxSpeed: number): number {
      const center = paddleY + PADDLE_H / 2;
      const diff = targetY - center;
      return Math.sign(diff) * Math.min(Math.abs(diff), maxSpeed);
    }

    function updateAI(dt: number) {
      const gs = gsRef.current;
      if (!gs) return;
      const ball = gs.balls[0];
      gs.aiLagTimer += dt;
      const precision = getTraitValue('precision');
      const reactionMs = isAdaptive ? 84 - precision * 32 : 60;
      if (gs.aiLagTimer >= reactionMs) {
        gs.aiLagTimer = 0;
        const targetY = predictBallY(ball, PADDLE_W + 5) + (Math.random() * (24 - precision * 16) - (12 - precision * 8));
        gs.aiTargetY = targetY;
      }
      gs.p1vy = aiMove(gs.p1y, gs.aiTargetY - PADDLE_H / 2, isAdaptive ? 4.8 + precision * 2.2 : 6);
      gs.p1y = Math.max(0, Math.min(H - PADDLE_H, gs.p1y + gs.p1vy));
    }

    let aiP2LagTimer = 0;
    let aiP2TargetY = H / 2;

    function updateAIp2(dt: number) {
      const gs = gsRef.current;
      if (!gs) return;
      const ball = gs.balls[0];

      // Reaction delay: only update target periodically
      aiP2LagTimer += dt;
      const risk = getTraitValue('risk');
      if (aiP2LagTimer >= (isAdaptive ? 96 - risk * 28 : 80)) {
        aiP2LagTimer = 0;
        // Difficulty scaling: AI gets better as the game progresses
        const gameProgress = Math.min(1, (gs.p1Score + gs.p2Score) / 10);
        const errorRange = (isAdaptive ? 36 - getTraitValue('precision') * 18 : 30) * (1 - gameProgress * 0.7);
        const offset = (Math.random() - 0.5) * errorRange;
        aiP2TargetY = predictBallY(ball, W - PADDLE_W - 5) + offset;
      }

      // Speed scales with game progress (4 → 6.5)
      const gameProgress = Math.min(1, (gs.p1Score + gs.p2Score) / 10);
      const aiSpeed = 4 + gameProgress * 2.5 + (isAdaptive ? (getTraitValue('tempo') - 0.5) * 1.4 : 0);
      const dy = aiMove(gs.p2y, aiP2TargetY - PADDLE_H / 2, aiSpeed);
      gs.p2y = Math.max(0, Math.min(H - PADDLE_H, gs.p2y + dy));
    }

    function checkScore() {
      const gs = gsRef.current;
      if (!gs) return;
      if (gs.p1Score >= SCORE_WIN || gs.p2Score >= SCORE_WIN) {
        if (gs.mode === 'tournament') {
          if (gs.p1Score >= SCORE_WIN) gs.p1Sets++;
          else gs.p2Sets++;
          if (gs.p1Sets >= 2 || gs.p2Sets >= 2) {
            gs.gameOver = true;
            gs.winner = gs.p1Sets >= 2 ? 'P1' : 'P2';
            const dur = (Date.now() - gs.startTime) / 1000;
            recordGame('pong', gs.p1Sets >= 2, gs.p1Score, dur, { won: gs.p1Sets >= 2, aiScore: gs.p2Score });
            setGameOverState(true);
          } else {
            gs.p1Score = 0; gs.p2Score = 0;
            gs.balls = [makeBall()];
          }
        } else {
          gs.gameOver = true;
          gs.winner = gs.p1Score >= SCORE_WIN ? 'P1' : 'AI';
          const dur = (Date.now() - gs.startTime) / 1000;
          const won = gs.p1Score >= SCORE_WIN;
          recordGame('pong', won, gs.p1Score, dur, { won, aiScore: gs.p2Score });
          setGameOverState(true);
        }
      }
    }

    function update(dt: number) {
      const gs = gsRef.current;
      if (!gs || gs.paused || gs.gameOver) return;

      // P1 control (left paddle)
      if (aiOnRef.current && !gs.aiDisabled) {
        // AI controls both paddles in AI demo mode
        updateAI(dt);
      } else {
        // Human controls P1 with W/S keys or touch
        if (keys['w'] || keys['W']) gs.p1y -= 6;
        if (keys['s'] || keys['S']) gs.p1y += 6;
        gs.p1y = Math.max(0, Math.min(H - PADDLE_H, gs.p1y));
      }
      // P2 control (right paddle)
      if (aiOnRef.current && !gs.aiDisabled || gs.mode === '1p' || gs.mode === 'tournament') {
        // AI controls P2 in AI demo mode, 1p mode, or tournament mode
        updateAIp2(dt);
      } else if (gs.mode === '2p') {
        if (keys['ArrowUp']) gs.p2y -= 6;
        if (keys['ArrowDown']) gs.p2y += 6;
        gs.p2y = Math.max(0, Math.min(H - PADDLE_H, gs.p2y));
      }

      for (let bi = gs.balls.length - 1; bi >= 0; bi--) {
        const ball = gs.balls[bi];
        ball.trail.unshift({ x: ball.x, y: ball.y });
        if (ball.trail.length > 5) ball.trail.pop();
        ball.x += ball.vx;
        ball.y += ball.vy;
        if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }
        if (ball.y > H - BALL_R) { ball.y = H - BALL_R; ball.vy = -Math.abs(ball.vy); }

        // P1 paddle (left)
        const p1h = gs.p1Effect === 1 ? PADDLE_H * 0.5 : gs.p1Effect === 2 ? PADDLE_H * 1.5 : PADDLE_H;
        if (ball.vx < 0 && ball.x - BALL_R <= PADDLE_W + 5 && ball.x - BALL_R >= PADDLE_W - 5 && ball.y >= gs.p1y - BALL_R && ball.y <= gs.p1y + p1h + BALL_R) {
          const rel = (ball.y - (gs.p1y + p1h / 2)) / (p1h / 2);
          const angle = rel * (Math.PI / 3);
          const speed = Math.min(10, Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) + 0.3);
          ball.vx = speed * Math.cos(angle);
          ball.vy = speed * Math.sin(angle);
          ball.x = PADDLE_W + 5 + BALL_R;
          gs.hitCount++;
          if (gs.hitCount % 8 === 0 && Math.random() < 0.25 && gs.balls.length < 3) gs.balls.push(makeBall(1));
        }

        // P2 paddle (right)
        const p2h = gs.p2Effect === 1 ? PADDLE_H * 0.5 : gs.p2Effect === 2 ? PADDLE_H * 1.5 : PADDLE_H;
        if (ball.vx > 0 && ball.x + BALL_R >= W - PADDLE_W - 5 && ball.x + BALL_R <= W - PADDLE_W + 5 && ball.y >= gs.p2y - BALL_R && ball.y <= gs.p2y + p2h + BALL_R) {
          const rel = (ball.y - (gs.p2y + p2h / 2)) / (p2h / 2);
          const speed = Math.min(10, Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) + 0.3);
          ball.vx = -speed * Math.cos(rel * (Math.PI / 3));
          ball.vy = speed * Math.sin(rel * (Math.PI / 3)) * Math.sign(ball.vy || 1);
          ball.x = W - PADDLE_W - 5 - BALL_R;
          gs.hitCount++;
        }

        // Scoring
        if (ball.x < -BALL_R) {
          gs.p2Score++;
          gs.balls.splice(bi, 1);
          if (gs.balls.length === 0) gs.balls.push(makeBall(1));
          gs.hitCount = 0;
          checkScore();
        } else if (ball.x > W + BALL_R) {
          gs.p1Score++;
          gs.balls.splice(bi, 1);
          if (gs.balls.length === 0) gs.balls.push(makeBall(-1));
          gs.hitCount = 0;
          checkScore();
        }
      }

      // Powerup
      gs.powerupTimer -= dt;
      if (gs.powerupTimer <= 0 && !gs.powerup) {
        gs.powerupTimer = 15000;
        gs.powerup = { x: W / 2, y: H / 4 + Math.random() * H / 2, type: Math.floor(Math.random() * 3), active: true, timer: 5000 };
      }
      if (gs.powerup?.active) {
        gs.powerup.timer -= dt;
        if (gs.powerup.timer <= 0) gs.powerup = null;
        else {
          for (const ball of gs.balls) {
            const pw = gs.powerup;
            if (!pw) break;
            if (Math.abs(ball.x - pw.x) < 15 && Math.abs(ball.y - pw.y) < 15) {
              if (pw.type === 0) gs.p1Effect = 2;
              else if (pw.type === 1) gs.p2Effect = 1;
              else ball.vx *= 1.5;
              gs.powerup = null;
            }
          }
        }
      }
      if (gs.p1EffectTimer > 0) { gs.p1EffectTimer -= dt; if (gs.p1EffectTimer <= 0) gs.p1Effect = 0; }
      if (gs.p2EffectTimer > 0) { gs.p2EffectTimer -= dt; if (gs.p2EffectTimer <= 0) gs.p2Effect = 0; }
    }

    function render() {
      const gs = gsRef.current;
      if (!gs) return;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, W, H);
      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.setLineDash([]);
      // Paddles
      const p1h = gs.p1Effect === 2 ? PADDLE_H * 1.5 : gs.p1Effect === 1 ? PADDLE_H * 0.5 : PADDLE_H;
      const p2h = gs.p2Effect === 2 ? PADDLE_H * 1.5 : gs.p2Effect === 1 ? PADDLE_H * 0.5 : PADDLE_H;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(5, gs.p1y, PADDLE_W, p1h, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(W - PADDLE_W - 5, gs.p2y, PADDLE_W, p2h, 4);
      ctx.fill();
      // Balls with trail
      for (const ball of gs.balls) {
        for (let i = ball.trail.length - 1; i >= 0; i--) {
          ctx.globalAlpha = 0.15 + (0.15 * (ball.trail.length - i) / ball.trail.length);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(ball.trail[i].x, ball.trail[i].y, BALL_R * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
      }
      // Powerup
      if (gs.powerup?.active) {
        const colors = ['#4fc', '#f44', '#ff0'];
        ctx.fillStyle = colors[gs.powerup.type];
        ctx.beginPath();
        ctx.arc(gs.powerup.x, gs.powerup.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
        ctx.fillText(['B+', 'S-', '>>'][gs.powerup.type], gs.powerup.x, gs.powerup.y + 3);
      }
      // Scores
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(gs.p1Score.toString(), W / 4, 70);
      ctx.fillText(gs.p2Score.toString(), 3 * W / 4, 70);
      if (gs.mode === 'tournament') {
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`Sets: ${gs.p1Sets}`, W / 4, 90);
        ctx.fillText(`Sets: ${gs.p2Sets}`, 3 * W / 4, 90);
      }
      // AI badge
      if (aiOnRef.current && !gs.aiDisabled) {
        ctx.fillStyle = 'rgba(0,200,255,0.85)';
        ctx.beginPath();
        ctx.roundRect(W / 2 - 28, 8, 56, 20, 5);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🤖 AI ON', W / 2, 22);
      }
      ctx.textAlign = 'left';
      if (gs.gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff5'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`${gs.winner} WINS!`, W / 2, H / 2 - 30);
        ctx.fillStyle = '#fff'; ctx.font = '14px monospace';
        ctx.fillText(`${gs.p1Score} - ${gs.p2Score}`, W / 2, H / 2 + 5);
        // Mobile-friendly: tap to play again drawn in canvas too
        ctx.fillStyle = '#4fc3f7';
        ctx.font = '13px monospace';
        ctx.fillText('Tap button below to play again', W / 2, H / 2 + 35);
      }
      if (gs.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
        ctx.fillText('PAUSED', W / 2, H / 2);
      }
    }

    function gameLoop(ts: number) {
      const gs = gsRef.current;
      if (!gs) return;
      if (isHubPausedRef.current) {
        gs.lastTime = ts; // prevent dt spike on resume
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }
      const dt = Math.min(ts - gs.lastTime, 50);
      gs.lastTime = ts;
      update(dt);
      render();
      const s = gs.p1Score + '-' + gs.p2Score;
      setDisplayScore(s);
      rafRef.current = requestAnimationFrame(gameLoop);
    }

    rafRef.current = requestAnimationFrame(gameLoop);

    const onKey = (e: KeyboardEvent) => {
      keys[e.key] = true;
      const gs = gsRef.current;
      if (!gs) return;
      if (e.key === 'r' || e.key === 'R') { if (gs.gameOver) initGame(gs.mode); }
      if (e.key === 'p' || e.key === 'P') gs.paused = !gs.paused;
      // Disable AI on key input
      if (['w', 'W', 's', 'S', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (['w', 'W'].includes(e.key)) recordPlayerAction('move:up', { precision: 0.64, tempo: 0.58 });
        if (['s', 'S'].includes(e.key)) recordPlayerAction('move:down', { precision: 0.64, tempo: 0.58 });
        if (e.key === 'ArrowUp') recordPlayerAction('move:up', { precision: 0.64, tempo: 0.58 });
        if (e.key === 'ArrowDown') recordPlayerAction('move:down', { precision: 0.64, tempo: 0.58 });
        if (aiOnRef.current) gs.aiDisabled = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { delete keys[e.key]; };

    // Touch: in 2p mode split left/right; in 1p/tournament entire canvas controls P1 only
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const gs = gsRef.current;
      if (!gs) return;
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const tx = (touch.clientX - rect.left) * (W / rect.width);
        const ty = (touch.clientY - rect.top) * (H / rect.height);
        if (gs.mode === '2p') {
          if (tx < W / 2) {
            recordPlayerAction(ty < gs.p1y + PADDLE_H / 2 ? 'move:up' : 'move:down', { precision: 0.62, tempo: 0.54 });
            gs.p1y = Math.max(0, Math.min(H - PADDLE_H, ty - PADDLE_H / 2));
          } else {
            gs.p2y = Math.max(0, Math.min(H - PADDLE_H, ty - PADDLE_H / 2));
          }
        } else {
          // 1p / tournament: entire canvas controls P1 only
          recordPlayerAction(ty < gs.p1y + PADDLE_H / 2 ? 'move:up' : 'move:down', { precision: 0.62, tempo: 0.54 });
          if (aiOnRef.current && !gs.aiDisabled) gs.aiDisabled = true;
          gs.p1y = Math.max(0, Math.min(H - PADDLE_H, ty - PADDLE_H / 2));
        }
      }
    };

    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchmove', onTouchMove);
    };
  }, [mode, initGame, recordGame]);

  useEffect(() => {
    const gs = gsRef.current;
    if (gs && aiDemoMode) gs.aiDisabled = false;
  }, [aiDemoMode]);

  const toggleAI = useCallback(() => {
    const gs = gsRef.current;
    if (gs) gs.aiDisabled = false;
    cycleMode();
  }, [cycleMode]);

  if (mode === 'menu') {
    return (
      <GameWrapper title="Pong 2.0">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <h2 style={{ color: '#4fc3f7', fontFamily: 'monospace', margin: 0 }}>PONG 2.0</h2>
          {(['1p', '2p', 'tournament'] as GameMode[]).map(m => (
            <button key={m} onClick={() => initGame(m)}
              style={{ padding: '10px 32px', fontSize: 15, background: '#1a2a3a', color: '#fff', border: '2px solid #4fc3f7', borderRadius: 8, cursor: 'pointer' }}>
              {m === '1p' ? 'vs AI' : m === '2p' ? '2 Players' : 'Tournament (Best of 3)'}
            </button>
          ))}
        </div>
      </GameWrapper>
    );
  }

  return (
    <GameWrapper title="Pong 2.0" score={displayScore} onRestart={() => initGame(mode)}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <canvas ref={canvasRef} width={W} height={H}
          style={{ maxWidth: '100%', maxHeight: '100%', touchAction: 'none' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleAI}
            style={{ padding: '6px 14px', fontSize: 12, background: demoMode === 'adaptive' ? '#7b1fa2' : aiDemoMode ? '#0288d1' : '#333', color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer' }}>
            {demoLabel}
          </button>
          {gameOverState && (
            <button onClick={() => initGame(mode)}
              style={{ padding: '6px 14px', fontSize: 12, background: '#27ae60', color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer' }}>
              🔄 Play Again
            </button>
          )}
          <button onClick={() => { cancelAnimationFrame(rafRef.current); setMode('menu'); }}
            style={{ padding: '6px 14px', fontSize: 12, background: '#555', color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer' }}>
            Menu
          </button>
        </div>
        {mode === '1p' && <div style={{ color: '#555', fontSize: 11 }}>Touch left half to move your paddle • Right half = opponent</div>}
        {mode === '2p' && <div style={{ color: '#555', fontSize: 11 }}>Left half = P1 • Right half = P2</div>}
      </div>
    </GameWrapper>
  );
}
