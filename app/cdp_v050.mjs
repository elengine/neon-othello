// v0.5.0 検証: トグルスイッチ・速度順・デフォルトゆらぎ・結果華やか・hud-actions右上独立・ログイン枠なし
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Page.enable(); await Runtime.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result.value;

await Page.navigate({ url: 'http://127.0.0.1:4173/' });
await new Promise(r => setTimeout(r, 1500));

// 1) 速度ボタンの順序とデフォルトpicked
await ev(`document.getElementById('btn-settings').click()`);
await new Promise(r => setTimeout(r, 250));
const paceOrder = await ev(`[...document.querySelectorAll('.pace-btn')].map(b => b.dataset.pace)`);
const pacePicked = await ev(`document.querySelector('.pace-btn.picked')?.dataset.pace`);
// 2) トグルスイッチ実寸
const toggle = await ev(`(() => { const c = document.querySelector('#screen-settings input[type=checkbox]'); const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
// 3) ログイン枠なし
await ev(`document.getElementById('back-title2').click()`);
await new Promise(r => setTimeout(r, 250));
const loginStyle = await ev(`(() => { const c = getComputedStyle(document.getElementById('btn-login')); return { border: c.borderTopWidth, bg: c.backgroundColor, fontSize: c.fontSize }; })()`);
// バージョン上下関係
const order = await ev(`(() => { const l = document.getElementById('btn-login').getBoundingClientRect(); const v = document.getElementById('app-version').getBoundingClientRect(); return l.bottom <= v.top + 8 ? 'login-then-version' : 'other'; })()`);

// 4) プレイ: hud-actions 固定右上かつ対戦者エリアと分離。石数は空欄
await ev(`document.querySelector('[data-level="1"]').click()`);
await new Promise(r => setTimeout(r, 400));
const act = await ev(`(() => { const a = document.querySelector('.hud-actions'); const r = a.getBoundingClientRect(); return { right: Math.round(window.innerWidth - r.right), top: Math.round(r.top), fixed: getComputedStyle(a).position }; })()`);
const cnt = await ev(`({b: document.getElementById('hud-black-count').textContent, w: document.getElementById('hud-white-count').textContent})`);

// 5) 結果画面: フォントサイズ＆アニメ
await ev(`document.getElementById('btn-pause').click()`);
await new Promise(r => setTimeout(r, 250));
await ev(`document.getElementById('btn-quit').click()`);
await new Promise(r => setTimeout(r, 350));
const resultStyle = await ev(`(() => { const t = document.getElementById('result-text'); const c = getComputedStyle(t); return { fontSize: c.fontSize, anim: c.animationName, weight: c.fontWeight }; })()`);

console.log(JSON.stringify({ paceOrder, pacePicked, toggle, loginStyle, order, act, cnt, resultStyle }, null, 1));
await client.close();
