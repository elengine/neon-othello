// v0.3.0 検証: ポーズモーダル再確認・ゲーム終了→title遷移・グロー単一化・HUD右上配置
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Page.enable(); await Runtime.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result.value;

await Page.navigate({ url: 'http://127.0.0.1:4173/' });
await new Promise(r => setTimeout(r, 1500));

// グロー: animation が neonPulse 1本か
const logoAnim = await ev(`getComputedStyle(document.querySelector('.logo')).animationName`);
const logoTextShadow = await ev(`getComputedStyle(document.querySelector('.logo')).textShadow`);

// AI戦 → ポーズ → 終了 → title 遷移
await ev(`document.querySelector('[data-level="1"]').click()`);
await new Promise(r => setTimeout(r, 400));
await ev(`document.getElementById('btn-pause').click()`);
await new Promise(r => setTimeout(r, 300));
const modal = await ev(`document.getElementById('overlay-pause').classList.contains('show')`);
// ボタンサイズ実測
const btnSize = await ev(`(() => { const b = document.getElementById('btn-resume'); const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(b).fontSize]; })()`);
await ev(`document.getElementById('btn-quit').click()`);
await new Promise(r => setTimeout(r, 350));
const afterQuit = await ev(`document.querySelector('.screen.active').id`);

// HUD右上: pause/mute の位置（右上寄り確認: viewport 右端からの距離）
await ev(`document.querySelector('[data-level="1"]').click()`);
await new Promise(r => setTimeout(r, 300));
const hudPos = await ev(`(() => { const p = document.getElementById('btn-pause').getBoundingClientRect(); return [Math.round(window.innerWidth - p.right), Math.round(p.top)]; })()`);

// 設定: 戻るボタン高さ
await ev(`document.getElementById('btn-pause').click()`);
await ev(`document.getElementById('btn-quit').click()`);
await ev(`document.getElementById('btn-settings').click()`);
await new Promise(r => setTimeout(r, 250));
const backSize = await ev(`(() => { const b = document.querySelector('#screen-settings .back'); const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(b).fontSize]; })()`);

console.log(JSON.stringify({ logoAnim, logoTextShadow, modal, btnSize, afterQuit, hudPos, backSize }, null, 1));
await client.close();
