/**
 * Ambient background music via Web Audio API — no asset files.
 *
 * Plays a slow Am → F → C → G chord progression using sine-wave pads,
 * filtered through a low-pass for warmth.  Each chord fades in/out over
 * 4 s so transitions are smooth even when the tab regains focus.
 */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let stopLoop: (() => void) | null = null;
let playing = false;
let enabled = false;

// Am  F   C   G  — each as [root, fifth, octaveRoot] in Hz (all ÷2 for warmth)
const CHORDS: number[][] = [
  [110.00, 164.81, 220.00], // Am  A2 E3 A3
  [87.307, 130.81, 174.61], // F   F2 C3 F3
  [130.81, 196.00, 261.63], // C   C3 G3 C4
  [98.000, 146.83, 196.00], // G   G2 D3 G3
];

const CHORD_DUR = 4.0; // seconds per chord

function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function ensureGraph(c: AudioContext) {
  if (masterGain && filter) return;
  masterGain = c.createGain();
  masterGain.gain.value = 0.55;
  filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.5;
  masterGain.connect(filter);
  filter.connect(c.destination);
}

function scheduleChord(c: AudioContext, mg: GainNode, freqs: number[], startTime: number, dur: number) {
  const fade = Math.min(0.6, dur * 0.15);
  const oscs: OscillatorNode[] = [];
  for (const freq of freqs) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(0.055, startTime + fade);
    g.gain.setValueAtTime(0.055, startTime + dur - fade);
    g.gain.linearRampToValueAtTime(0, startTime + dur);
    osc.connect(g);
    g.connect(mg);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.05);
    oscs.push(osc);
  }
  return oscs;
}

function startAmbientLoop(c: AudioContext, mg: GainNode): () => void {
  let stopped = false;
  let chordIndex = 0;
  const allOscs: OscillatorNode[] = [];

  function scheduleNext() {
    if (stopped) return;
    const now = c.currentTime;
    const freqs = CHORDS[chordIndex % CHORDS.length];
    const oscs = scheduleChord(c, mg, freqs, now, CHORD_DUR);
    allOscs.push(...oscs);
    chordIndex += 1;
    // Schedule the next chord slightly before this one ends for seamless overlap
    const delay = (CHORD_DUR - 0.05) * 1000;
    setTimeout(() => { if (!stopped) scheduleNext(); }, delay);
  }

  scheduleNext();

  return () => {
    stopped = true;
    const now = c.currentTime;
    allOscs.forEach(o => { try { o.stop(now + 0.05); } catch { /* already stopped */ } });
  };
}

export function setMusicEnabled(on: boolean): void {
  enabled = on;
  if (on) {
    startMusic();
  } else {
    stopMusic();
  }
}

export function startMusic(): void {
  if (playing || !enabled) return;
  const c = getCtx();
  if (!c) return;
  ensureGraph(c);
  playing = true;
  stopLoop = startAmbientLoop(c, masterGain!);
}

export function stopMusic(): void {
  if (!playing) return;
  playing = false;
  if (stopLoop) { stopLoop(); stopLoop = null; }
}
