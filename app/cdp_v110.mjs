// スライダー検証
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime } = client;
await Runtime.enable();
await Page.navigate({ url: 'http://127.0.0.1:4174/' });
await new Promise(r => setTimeout(r, 1400));
await Runtime.evaluate({ expression: `document.getElementById('btn-settings').click()` });
await new Promise(r => setTimeout(r, 300));
await Runtime.evaluate({ expression: `
  (() => { const r1 = document.getElementById('mk-ring'); r1.value = '40'; r1.dispatchEvent(new Event('input'));
           const r2 = document.getElementById('mk-dot'); r2.value = '60'; r2.dispatchEvent(new Event('input')); })()` });
await new Promise(r => setTimeout(r, 300));
const stored = (await Runtime.evaluate({ expression: `localStorage.getItem('otv2:prefs')`, returnByValue: true })).result.value;
const labels = (await Runtime.evaluate({ expression:
  `JSON.stringify({ring: document.getElementById('mk-ring-v').textContent, dot: document.getElementById('mk-dot-v').textContent})`, returnByValue: true })).result.value;
const names = (await Runtime.evaluate({ expression:
  `[...document.querySelectorAll('#preset-grid .lv-name')].map(x => x.textContent)`, returnByValue: true })).result.value;
const nowrap = (await Runtime.evaluate({ expression:
  `getComputedStyle(document.querySelector('#preset-grid .lv-name')).whiteSpace`, returnByValue: true })).result.value;
console.log(JSON.stringify({ stored, labels, names, nowrap }));
await client.close();
