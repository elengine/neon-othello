// レベルアップ賑やかし演出（設計書 §6・F-504）
import gsap from 'gsap';
import { titleFor } from '../supabase/auth';
import { sfx } from '../audio/sfx';

export function celebrateLevelUp(level: number, fromLevel: number, xp: number): void {
  const layer = document.createElement('div');
  layer.className = 'celebrate';
  const big = level >= 10 && fromLevel < 10 || Math.floor(level / 10) > Math.floor(fromLevel / 10); // 称号昇格は豪華に
  layer.innerHTML = `
    <div class="c-confetti"></div>
    <div class="c-card${big ? ' c-titleup' : ''}">
      <div class="c-ring"></div>
      <div class="c-badge">LEVEL ${level}</div>
      <div class="c-title">${titleFor(level)}</div>
      <div class="c-sub">レベルアップ！ 累計XP ${xp}</div>
    </div>`;
  document.body.appendChild(layer);

  // コンフェッティ 120発（GSAP・transformのみで60fps）
  const colors = ['#16e0ff', '#ff3df5', '#ffd86b', '#8ef0c0', '#a5b4fc'];
  const conf = layer.querySelector('.c-confetti')!;
  for (let i = 0; i < (big ? 150 : 90); i++) {
    const p = document.createElement('i');
    p.style.left = (Math.random() * 100) + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.9) + 's';
    p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    p.style.setProperty('--d', (2 + Math.random() * 1.8) + 's');
    conf.appendChild(p);
  }

  const card = layer.querySelector('.c-card')!;
  gsap.fromTo(card, { scale: 0.2, rotate: -8, autoAlpha: 0 },
    { scale: 1, rotate: 0, autoAlpha: 1, duration: 0.6, ease: 'back.out(2.2)' });
  gsap.fromTo(layer.querySelector('.c-ring')!, { scale: 0.3, autoAlpha: 0.9 },
    { scale: big ? 2.6 : 1.9, autoAlpha: 0, duration: 1.0, ease: 'power2.out', delay: 0.25 });
  if (big) gsap.to(card, { keyframes: [{ x: -6 }, { x: 6 }, { x: -4 }, { x: 0 }], duration: 0.35, delay: 0.6 });

  // 効果音（sfx共通・ミュート設定追従）
  sfx.levelup(big);

  setTimeout(() => gsap.to(layer, { autoAlpha: 0, duration: 0.45, onComplete: () => layer.remove() }), big ? 3800 : 2800);
}
