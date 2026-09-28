let ctx = null;
let master = null;
let noiseBuf = null;
let volume = 0.5;

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function out(volume, pan) {
  const g = ctx.createGain();
  g.gain.value = volume;
  if (pan !== undefined && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p); p.connect(master);
  } else g.connect(master);
  return g;
}

function noiseBurst(dest, dur, freq, q, attack = 0.002) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + attack);
  env.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(env); env.connect(dest);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

function tone(dest, freq, dur, type = 'sine', endFreq) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.8, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(env); env.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

export function playShot(kind = 'rifle', volume = 1, pan) {
  if (!ctx) return;
  const d = out(volume, pan);
  if (kind === 'pistol') {
    noiseBurst(d, 0.12, 2400, 0.8);
    tone(d, 180, 0.08, 'triangle', 60);
  } else if (kind === 'deagle') {
    noiseBurst(d, 0.3, 1100, 0.6);
    tone(d, 120, 0.18, 'square', 40);
  } else if (kind === 'smg') {
    noiseBurst(d, 0.1, 2000, 0.9);
    tone(d, 200, 0.06, 'square', 80);
  } else if (kind === 'shotgun') {
    noiseBurst(d, 0.4, 700, 0.5);
    noiseBurst(d, 0.15, 2500, 0.8);
    tone(d, 90, 0.25, 'sawtooth', 30);
  } else if (kind === 'scout') {
    noiseBurst(d, 0.3, 1500, 0.6);
    tone(d, 160, 0.2, 'sawtooth', 50);
  } else if (kind === 'sniper') {
    noiseBurst(d, 0.45, 900, 0.5);
    noiseBurst(d, 0.2, 3500, 1);
    tone(d, 110, 0.3, 'sawtooth', 35);
  } else if (kind === 'rifleS') {
    noiseBurst(d, 0.14, 1800, 0.8);
    noiseBurst(d, 0.06, 5000, 1.4);
    tone(d, 160, 0.1, 'square', 55);
  } else {
    noiseBurst(d, 0.18, 1400, 0.7);
    noiseBurst(d, 0.08, 4200, 1.2);
    tone(d, 140, 0.12, 'square', 45);
  }
}

export function playHit(head) {
  if (!ctx) return;
  const d = out(0.35);
  if (head) { tone(d, 1600, 0.18, 'sine'); tone(d, 2400, 0.12, 'sine'); }
  else tone(d, 900, 0.07, 'triangle');
}

export function playHurt() {
  if (!ctx) return;
  const d = out(0.5);
  noiseBurst(d, 0.15, 400, 1.5);
  tone(d, 220, 0.15, 'sawtooth', 110);
}

export function playReload() {
  if (!ctx) return;
  const d = out(0.3);
  noiseBurst(d, 0.05, 3000, 5);
  setTimeout(() => ctx && noiseBurst(out(0.3), 0.06, 2000, 5), 450);
  setTimeout(() => ctx && noiseBurst(out(0.35), 0.05, 3500, 6), 1500);
}

export function playEmpty() {
  if (!ctx) return;
  noiseBurst(out(0.25), 0.03, 5000, 8);
}

export function playStep(volume = 0.15, pan) {
  if (!ctx) return;
  noiseBurst(out(volume, pan), 0.09, 350 + Math.random() * 200, 1.2, 0.005);
}

export function playKill() {
  if (!ctx) return;
  const d = out(0.3);
  tone(d, 660, 0.1, 'square');
  setTimeout(() => ctx && tone(out(0.3), 990, 0.15, 'square'), 90);
}

export function playSwish() {
  if (!ctx) return;
  noiseBurst(out(0.2), 0.15, 1800, 2, 0.04);
}

export function playBombBeep(volume = 0.35, pan) {
  if (!ctx) return;
  tone(out(volume, pan), 2600, 0.09, 'sine');
}

export function playKeypad() {
  if (!ctx) return;
  tone(out(0.2), 1200 + Math.random() * 800, 0.06, 'square');
}

export function playDefuse(volume = 0.3, pan) {
  if (!ctx) return;
  noiseBurst(out(volume, pan), 0.2, 4000, 3, 0.02);
}

export function playExplosion(volume = 1, pan) {
  if (!ctx) return;
  const d = out(volume, pan);
  noiseBurst(d, 2.2, 180, 0.4, 0.01);
  noiseBurst(d, 0.8, 600, 0.5, 0.01);
  tone(d, 60, 1.5, 'sawtooth', 20);
}

export function playGrenade(kind, volume = 1, pan) {
  if (!ctx) return;
  const d = out(volume, pan);
  if (kind === 'he') { noiseBurst(d, 1.0, 300, 0.5, 0.005); tone(d, 70, 0.6, 'sawtooth', 25); }
  else if (kind === 'flash') { noiseBurst(d, 0.25, 3000, 0.8, 0.002); }
  else noiseBurst(d, 1.5, 5000, 0.4, 0.2);
}

export function playBounce(volume = 0.3, pan) {
  if (!ctx) return;
  tone(out(volume, pan), 900 + Math.random() * 300, 0.04, 'triangle');
}

let ringNode = null;
export function playFlashRing(duration) {
  if (!ctx) return;
  if (ringNode) { try { ringNode.stop(); } catch { /* already stopped */ } }
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.value = 3200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + duration + 0.05);
  ringNode = o;
}

export function playRoundStart() {
  if (!ctx) return;
  const d = out(0.25);
  tone(d, 523, 0.12, 'triangle');
  setTimeout(() => ctx && tone(out(0.25), 784, 0.2, 'triangle'), 130);
}

export function announce(text) {
  try {
    if (!('speechSynthesis' in window) || volume <= 0) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    u.rate = 1.05;
    u.volume = Math.min(1, volume * 1.6);
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('pt'));
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* speech not available */ }
}

export function playBuy() {
  if (!ctx) return;
  tone(out(0.25), 880, 0.08, 'triangle');
}
