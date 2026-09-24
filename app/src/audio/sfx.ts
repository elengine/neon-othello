// 効果音エンジン（WebAudio合成・著作権フリー・howlerハブ維持で将来ファイル音源に差し替え可）
import { Howler } from 'howler';

const MUTE_KEY = '***';
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* プライベートモード */ }
Howler.mute(muted);

export function isMuted(): boolean { return muted; }
export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* noop */ }
  Howler.mute(muted);
  return muted;
}

let actx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (!actx) {
    const ACtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ACtor) return null;
    actx = new ACtor();
  }
  if (actx.state === 'suspended') void actx.resume();
  return actx;
}

function beep(f: number, at: number, dur: number, g: number, type: OscillatorType = 'triangle'): void {
  const a = ctx(); if (!a || muted) return;
  const t0 = a.currentTime + at;
  const o = a.createOscillator(), gn = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  gn.gain.setValueAtTime(g, t0); gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(gn).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}

export const sfx = {
  place: () => beep(300, 0, 0.07, 0.14),
  flip: (n = 1) => { for (let i = 0; i < Math.min(n, 7); i++) beep(460 + i * 80, i * 0.055, 0.07, 0.12); },
  pass: () => { beep(200, 0, 0.12, 0.12); beep(150, 0.1, 0.15, 0.1); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => beep(f, i * 0.11, 0.24, 0.17)),
  lose: () => [392, 330, 262].forEach((f, i) => beep(f, i * 0.15, 0.28, 0.13)),
  draw: () => [392, 392, 330].forEach((f, i) => beep(f, i * 0.13, 0.2, 0.12)),
  warn: () => beep(880, 0, 0.09, 0.16, 'square'),
  levelup: (big = false) => {
    [523.25, 659.25, 783.99, big ? 1046.5 : 783.99].forEach((f, i) => beep(f, i * 0.13, big ? 0.34 : 0.26, 0.17));
    if (big) [1046.5, 1318.5, 1568].forEach((f, i) => beep(f, 0.52 + i * 0.1, 0.4, 0.12));
  },
  invite: () => { beep(660, 0, 0.1, 0.14); beep(880, 0.12, 0.14, 0.14); },
};
