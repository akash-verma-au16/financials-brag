// Synthesizes the soundtrack: 96 BPM, A minor, Am–F–C–G. Every event sits on the beat grid from t = 0.
import { writeFileSync } from "node:fs";

const SR = 48000, BPM = 96, BEAT = 60 / BPM, BEATS = 34, LEN = BEATS * BEAT;
const N = Math.ceil(LEN * SR);
const L = new Float32Array(N), R = new Float32Array(N), send = new Float32Array(N);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CUTS = [5, 9, 17, 23, 29]; // scene changes, in beats
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G (MIDI)
const ROOTS = [45, 41, 48, 43];

function add(t0, dur, fn, gain, pan = 0, wet = 0) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n && s0 + i < N; i++) {
    const v = fn(i / SR);
    L[s0 + i] += v * gl; R[s0 + i] += v * gr; send[s0 + i] += v * gain * wet;
  }
}

// Pads: one chord per bar, soft detuned sine/triangle with slow swell.
for (let bar = 0; bar * 4 < BEATS; bar++) {
  const t0 = bar * 4 * BEAT, dur = Math.min(4 * BEAT + 0.6, LEN - t0);
  const ch = bar * 4 + 4 > BEATS ? CHORDS[0] : CHORDS[bar % 4];
  ch.forEach((m, k) => {
    const f = hz(m + 12 * (k === 0 ? 0 : 0));
    add(t0, dur, (t) => {
      const env = Math.min(1, t / 0.45) * Math.min(1, (dur - t) / 0.5);
      const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * 1.003 * t));
      return env * (0.6 * Math.sin(2 * Math.PI * f * t) + 0.25 * tri + 0.15 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 2));
    }, 0.055, (k - 1) * 0.5, 0.6);
  });
}

// Bass: plucked roots on beats 1 and 3, from the reveal onward.
for (let b = 4; b < BEATS; b += 2) {
  const root = ROOTS[Math.floor(b / 4) % 4], f = hz(root - 12);
  add(b * BEAT, 2 * BEAT, (t) => Math.exp(-t * 2.2) * Math.min(1, t / 0.01) * (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(4 * Math.PI * f * t)), 0.22);
}

// Kick: soft, on beats 1 and 3, from the reveal until the last bar.
for (let b = 4; b < BEATS - 2; b += 2) {
  add(b * BEAT, 0.35, (t) => Math.sin(2 * Math.PI * (45 * t + 75 * (1 - Math.exp(-t * 30)) / 30)) * Math.exp(-t * 11), 0.28);
}

// Shaker: quiet off-beat eighths through the app scenes.
let seed = 7;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 31) - 1;
for (let b = 9; b < 29; b++) {
  let prev = 0;
  add((b + 0.5) * BEAT, 0.08, (t) => { const x = noise(), hp = x - prev; prev = x; return hp * Math.exp(-t * 60); }, 0.025, b % 2 ? 0.3 : -0.3, 0.3);
}

// Arpeggio: glassy eighths on chord tones during the app scenes.
for (let b = 9; b < 29; b++) {
  for (const half of [0, 0.5]) {
    const ch = CHORDS[Math.floor(b / 4) % 4], step = (b * 2 + half * 2) % 3;
    const f = hz(ch[step] + 12);
    add((b + half) * BEAT, 0.6, (t) => Math.exp(-t * 7) * Math.min(1, t / 0.004) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t * 12)), 0.045, step - 1, 0.5);
  }
}

// Bells on every cut, in key (E and A), mostly in the reverb.
CUTS.forEach((b, i) => {
  const f = hz(i % 2 ? 76 : 81);
  add(b * BEAT, 2.2, (t) => Math.exp(-t * 2.6) * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 4) + 0.12 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 8)), 0.07, 0, 0.9);
});

// Reverb: Schroeder (4 combs + 2 allpasses) on the send bus.
function reverb(x) {
  const y = new Float32Array(N);
  for (const [d, g] of [[1557, 0.8], [1617, 0.79], [1491, 0.78], [1422, 0.77]]) {
    const buf = new Float32Array(Math.round(d * SR / 44100)); let p = 0, lp = 0;
    for (let i = 0; i < N; i++) { const o = buf[p]; lp = o * 0.7 + lp * 0.3; buf[p] = x[i] + lp * g; p = (p + 1) % buf.length; y[i] += o / 4; }
  }
  for (const d of [225, 556]) {
    const buf = new Float32Array(d); let p = 0;
    for (let i = 0; i < N; i++) { const b = buf[p], v = y[i] + b * 0.5; buf[p] = v; y[i] = b - v * 0.5; p = (p + 1) % d; }
  }
  return y;
}
const wet = reverb(send);
for (let i = 0; i < N; i++) { L[i] += wet[i] * 0.55; R[i] += wet[(i + 240) % N] * 0.55; }

// Master: gentle fade-in/out, soft clip, normalize to -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, g = Math.min(1, t / 0.08) * Math.min(1, (LEN - t) / 0.9);
  L[i] = Math.tanh(L[i] * g * 1.2); R[i] = Math.tanh(R[i] * g * 1.2);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;
const out = Buffer.alloc(44 + N * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  out.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4);
}
writeFileSync(new URL("./music.wav", import.meta.url), out);
console.log(`music.wav ${LEN.toFixed(3)}s`);
