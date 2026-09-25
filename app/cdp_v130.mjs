// v1.3.0 検証: マーカー固定仕様/設定UI撤去/AI速度文言/同色拒否
import CDP from 'chrome-remote-interface';
import fs from 'fs';
const client = await CDP();
const { Page, Runtime } = client;
await Runtime.enable(); await Page.enable();
await Page.navigate({ url: 'http://localhost:8130/' });
await new Promise(r => setTimeout(r, 3000));
const ev = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result.value;

console.log('ver:', await ev(`document.getElementById('ver-tag')?.textContent ?? (window.__APP_VERSION__ ?? '?')`));
// 1) 設定画面にマーカー設定が無いこと＋AI速度表示
await ev(`document.getElementById('btn-settings').click()`);
await new Promise(r => setTimeout(r, 400));
console.log('marker UI removed:', await ev(`!document.getElementById('mk-ring') && !document.getElementById('seg-ring-color') && ![...document.querySelectorAll('#screen-settings h2')].some(h=>h.textContent.includes('マーカー'))`));
console.log('AI speed label:', await ev(`[...document.querySelectorAll('#screen-settings h2')].map(h=>h.textContent).join('|')`));
// 2) 同色拒否: 先手を後手と同色に
const reject = await ev(`(() => {
  const b = document.getElementById('pick-black'), w = document.getElementById('pick-white');
  const before = { b: b.value, w: w.value, themeB: null };
  b.value = w.value; b.dispatchEvent(new Event('input', { bubbles: true }));
  return JSON.stringify({ after: b.value, wWas: before.w, toast: document.getElementById('pass-toast')?.textContent });
})()`);
console.log('same-color guard:', reject);
// 3) 不同色なら従来どおり反映されること
const ok = await ev(`(() => {
  const b = document.getElementById('pick-black'), w = document.getElementById('pick-white');
  b.value = '#00ff88'; b.dispatchEvent(new Event('input', { bubbles: true }));
  return JSON.stringify({ b: b.value, w: w.value, cssVar: getComputedStyle(document.documentElement).getPropertyValue('--stone-black').trim() });
})()`);
console.log('valid pick:', ok);
await client.close();
