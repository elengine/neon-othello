// v0.4.0 検証: ボタン名/ghost2・グロー多重解消・トグル大・石数? 表示
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Page.enable(); await Runtime.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result.value;

await Page.navigate({ url: 'http://127.0.0.1:4173/' });
await new Promise(r => setTimeout(r, 1500));

// スタート画面: ボタン名とクラス
const titles = await ev(`[...document.querySelectorAll('.menu .btn')].map(b => [b.textContent, b.className.split(' ').find(c => c.startsWith('btn-main') || c.startsWith('btn-ghost2'))])`);
// ghost2 にアニメ無し・box-shadow無し
const ghostAnim = await ev(`getComputedStyle(document.querySelector('.btn-ghost2')).animationName`);
const ghostShadow = await ev(`getComputedStyle(document.querySelector('.btn-ghost2')).boxShadow`);
// main ボタン は ctaGlow 1本
const mainAnim = await ev(`getComputedStyle(document.querySelector('.btn-main')).animationName`);
// 文字サイズ
const sizes = await ev(`({main: getComputedStyle(document.querySelector('.btn-main')).fontSize, ghost: getComputedStyle(document.querySelector('.btn-ghost2')).fontSize, login: getComputedStyle(document.querySelector('.login')).fontSize})`);

// 設定: トグルと色ピッカーのサイズ
await ev(`document.getElementById('btn-settings').click()`);
await new Promise(r => setTimeout(r, 250));
const tg = await ev(`({chk: (() => { const c = document.querySelector('#screen-settings input[type=checkbox]'); const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(), color: (() => { const c = document.querySelector('#screen-settings input[type=color]'); const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()})`);

// ゲーム: 石数が '?' で始まり、終了時に数値化
await ev(`document.getElementById('back-title2').click()`);
await ev(`document.querySelector('[data-level="1"]').click()`);
await new Promise(r => setTimeout(r, 500));
const countsDuring = await ev(`({b: document.getElementById('hud-black-count').textContent, w: document.getElementById('hud-white-count').textContent})`);

console.log(JSON.stringify({ titles, ghostAnim, ghostShadow, mainAnim, sizes, tg, countsDuring }, null, 1));
await client.close();
