// v0.8.0検証: 幅82%・トコロノブ・turn-sideバー強調・think拡大
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Page.enable(); await Runtime.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result.value;

await Page.navigate({ url: 'http://127.0.0.1:4173/' });
await new Promise(r => setTimeout(r, 1500));

// 1) 設定: 幅82% & テーマ列数 & 新トグルSW
await ev(`document.getElementById('btn-settings').click()`);
await new Promise(r => setTimeout(r, 250));
const area = await ev(`(() => { const s = document.getElementById('screen-settings'); const c = getComputedStyle(s); const r = s.getBoundingClientRect(); return { widthPx: Math.round(r.width), vw: c.width, maxWidth: c.maxWidth, cols: getComputedStyle(document.getElementById('preset-grid')).gridTemplateColumns.split(' ').length }; })()`);
const tg = await ev(`(() => { const el = document.querySelector('.toggle-row .sw input'); el.checked = true; el.dispatchEvent(new Event('change'));
  const a = getComputedStyle(el, '::after'); const b = el.getBoundingClientRect();
  return { box: [Math.round(b.width), Math.round(b.height)], knobW: a.width, knobLeft: a.left, transform: a.transform }; })()`);
// knob left+width <= box幅？
const knobOk = await ev(`(() => { const el = document.querySelector('.toggle-row .sw input'); const a = getComputedStyle(el, '::after'); const b = el.getBoundingClientRect();
  const left = parseFloat(a.left), w = parseFloat(a.width);
  return (left + w) <= b.width; })()`);

// 2) ゲーム: turn-side（バー強調）と文言空
await ev(`document.getElementById('back-title2').click()`);
await ev(`document.querySelector('[data-level="2"]').click()`);
await new Promise(r => setTimeout(r, 350));
const turnUI = await ev(`({ turnText: document.getElementById('hud-turn').textContent,
  myBar: document.querySelector('footer').classList.contains('turn-side'),
  oppBar: document.querySelector('header').classList.contains('turn-side') })`);
const thinkFont = await ev(`(() => { const t = document.getElementById('think-overlay'); t.classList.add('show'); const c = getComputedStyle(t); return c.fontSize; })()`);

console.log(JSON.stringify({ area, tg, knobOk, turnUI, thinkFont }, null, 1));
await client.close();
