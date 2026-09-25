// セグメント色切替検証
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime } = client;
await Runtime.enable();
await Page.navigate({ url: 'http://127.0.0.1:4174/' });
await new Promise(r => setTimeout(r, 1400));
await Runtime.evaluate({ expression: `document.getElementById('btn-settings').click()` });
await new Promise(r => setTimeout(r, 300));
// 外枠 → 白 / 中心 → テーマ色
await Runtime.evaluate({ expression: `
  (() => { document.querySelector('#seg-ring-color [data-vc="white"]').click();
           setTimeout(() => document.querySelector('#seg-dot-color [data-vc="theme"]').click(), 60); })()` });
await new Promise(r => setTimeout(r, 400));
const stored = (await Runtime.evaluate({ expression: `localStorage.getItem('otv2:prefs')`, returnByValue: true })).result.value;
const picked = (await Runtime.evaluate({ expression:
  `JSON.stringify({ ring: document.querySelector('#seg-ring-color .picked')?.dataset.vc,
                    dot: document.querySelector('#seg-dot-color .picked')?.dataset.vc })`, returnByValue: true })).result.value;
// 再読込で復元確認
await Page.navigate({ url: 'http://127.0.0.1:4174/' });
await new Promise(r => setTimeout(r, 1400));
await Runtime.evaluate({ expression: `document.getElementById('btn-settings').click()` });
await new Promise(r => setTimeout(r, 250));
const after = (await Runtime.evaluate({ expression:
  `JSON.stringify({ ring: document.querySelector('#seg-ring-color .picked')?.dataset.vc,
                    dot: document.querySelector('#seg-dot-color .picked')?.dataset.vc })`, returnByValue: true })).result.value;
const lvFontSize = (await Runtime.evaluate({ expression:
  `getComputedStyle(document.querySelector('#preset-grid .lv-name')).fontSize`, returnByValue: true })).result.value;
const overflow = (await Runtime.evaluate({ expression:
  `(() => { const el = document.querySelector('#preset-grid .lv-name'); return el.scrollWidth <= el.clientWidth + 2; })()`, returnByValue: true })).result.value;
console.log(JSON.stringify({ stored, picked, after, lvFontSize, overflow }));
await client.close();
