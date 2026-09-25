// v0.7.0検証: スタート順・テーマカードpad・トグル・手番強調・思考オーバーレイ・手数非表示・結果詳細
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Page.enable(); await Runtime.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result.value;

await Page.navigate({ url: 'http://127.0.0.1:4173/' });
await new Promise(r => setTimeout(r, 1500));

// 1) スタート順: top-Y baseline
const order = await ev(`(() => { const g = (s) => document.querySelector(s).getBoundingClientRect().top;
  return { logo: g('.logo'), version: g('#app-version'), login: g('#btn-login'), play: g('.menu:not(.menu-sub)'), sub: g('.menu-sub') }; })()`);

// 2) 設定: テーマカードpad/トグル
await ev(`document.getElementById('btn-settings').click()`);
await new Promise(r => setTimeout(r, 250));
const theme = await ev(`(() => { const c = document.querySelector('#preset-grid .lv-card'); const s = getComputedStyle(c); const r = c.getBoundingClientRect(); return { pad: s.padding, h: Math.round(r.height) }; })()`);
const toggleKnob = await ev(`(() => {
  const el = document.querySelector('#screen-settings input[type=checkbox]');
  el.checked = true; el.dispatchEvent(new Event('change'));
  // pseudo-elementはgetComputedStyle(el,'::after')で実寸確認
  const a = getComputedStyle(el, '::after');
  const knob = { w: a.width, h: a.height, left: a.left, top: a.top };
  const r = el.getBoundingClientRect();
  return { knob, box: [Math.round(r.width), Math.round(r.height)] }; })()`);

// 3) ゲーム: 手番強調・思考オーバーレイ
await ev(`document.getElementById('back-title2').click()`);
await ev(`document.querySelector('[data-level="2"]').click()`);
await new Promise(r => setTimeout(r, 300));
const hasMarkup = await ev(`({hudTurn: document.getElementById('hud-turn').textContent.length,
  meTurnOn: document.querySelector('.hud-me').classList.contains('turn-on'),
  oppTurnOn: document.querySelector('.hud-opp').classList.contains('turn-on')})`);
await new Promise(r => setTimeout(r, 200));
// AI手番中 → think-overlay 表示（AI思考中）を待つ
await new Promise(r => setTimeout(r, 200));
const thinkShow = await ev(`document.getElementById('think-overlay').classList.contains('show')`);

// 4) 結果: 終局まで待って詳細文字列
await new Promise(r => setTimeout(r, 15000));
const res = await ev(`({detail: document.getElementById('result-detail')?.textContent ?? '(none)',
  text: document.getElementById('result-text')?.textContent ?? ''})`);

console.log(JSON.stringify({ order, theme, toggleKnob, hasMarkup, thinkShow, res }, null, 1));
await client.close();
