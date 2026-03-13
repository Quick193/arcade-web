/** Synthesised sound effects via Web Audio API — no audio files needed */

export type SfxId =
  | 'jump' | 'land' | 'eatFood' | 'shoot' | 'enemyDie'
  | 'die' | 'powerup' | 'lineClear' | 'tetris' | 'levelUp' | 'score';

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!_ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      _ctx = new AC();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  } catch {
    return null;
  }
}

/** Play a synthesised sound effect. No-ops when sfxEnabled=false or AudioContext unavailable. */
export function playSfx(id: SfxId, enabled = true): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  try {
    switch (id) {
      case 'jump':     tone(c, 'sine',     380, 600, 0.10, 0.12); break;
      case 'land':     noise(c, 0.08, 0.06); break;
      case 'eatFood':  tone(c, 'square',   660, 880, 0.10, 0.07); break;
      case 'score':    tone(c, 'sine',     520, 780, 0.10, 0.10); break;
      case 'shoot':    tone(c, 'sawtooth', 900, 400, 0.07, 0.07); break;
      case 'enemyDie': tone(c, 'square',   280, 100, 0.09, 0.09); break;
      case 'die':      dieSfx(c); break;
      case 'powerup':  powerupSfx(c); break;
      case 'lineClear':tone(c, 'sine',     500, 800, 0.13, 0.18); break;
      case 'tetris':   tetrisSfx(c); break;
      case 'levelUp':  levelUpSfx(c); break;
    }
  } catch { /* silently ignore */ }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function tone(
  c: AudioContext,
  type: OscillatorType,
  f0: number,
  f1: number,
  gain: number,
  dur: number,
): void {
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(f1, c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}

function noise(c: AudioContext, gain: number, dur: number): void {
  const size = Math.floor(c.sampleRate * dur);
  const buf  = c.createBuffer(1, size, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const src = c.createBufferSource();
  const g   = c.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(gain, c.currentTime);
  src.connect(g);
  g.connect(c.destination);
  src.start();
}

function dieSfx(c: AudioContext): void {
  [1, 2, 3].forEach((step, i) => {
    const freq = 300 / step;
    setTimeout(() => tone(c, 'sawtooth', freq * 2, freq, 0.14, 0.12), i * 90);
  });
}

function powerupSfx(c: AudioContext): void {
  [330, 440, 550, 660].forEach((f, i) => {
    setTimeout(() => tone(c, 'sine', f, f * 1.12, 0.09, 0.08), i * 65);
  });
}

function tetrisSfx(c: AudioContext): void {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => tone(c, 'sine', f, f, 0.14, 0.13), i * 80);
  });
}

function levelUpSfx(c: AudioContext): void {
  [440, 554, 659, 880].forEach((f, i) => {
    setTimeout(() => tone(c, 'square', f, f * 1.05, 0.08, 0.11), i * 70);
  });
}
