// v1.5.1 検証: 名前化けバグ撤去(バンドルに'対局終了'なし)/結果画面ボタン=ゲーム終了/スモーク(1手打って例外なし)
import CDP from 'chrome-remote-interface';
const client = await CDP();
const { Page, Runtime, Emulation, Input } = client;
await Runtime.enable(); await Page.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
await Page.navigate({ url: 'http://localhost:8140/' });
await new Promise(r => setTimeout(r, 2500));
const ev = async (expr) => (await Runtime.evaluate({ expression: `(() => {${expr}})()`, returnByValue: true })).result.value;
const tap = async (x, y) => {
  await Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await new Promise(r => setTimeout(r, 60));
  await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });
  await new Promise(r => setTimeout(r, 250));
};
const center = async (sel) => JSON.parse(await ev(`const r=document.querySelector('${sel}').getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})`));
// 結果画面ボタン文言（DOM直）
console.log('result btn:', await ev(`return document.getElementById('btn-result-title').textContent`));
// AI対戦スモーク: 1手打つ
const b = await center('#btn-ai'); await tap(b.x, b.y);
const l = await center('[data-level="1"]'); await tap(l.x, l.y);
await new Promise(r => setTimeout(r, 400));
const g = JSON.parse(await ev(`const r=document.getElementById('board').getBoundingClientRect(); return JSON.stringify({left:r.left,top:r.top,cell:r.width/8})`));
await tap(g.left + 4.5 * g.cell, g.top + 2.5 * g.cell); // 合法手(2,4)
await new Promise(r => setTimeout(r, 2500));
console.log('me-name after move:', await ev(`return document.getElementById('hud-me-name').textContent`));
console.log('game screen:', await ev(`return document.getElementById('screen-game').classList.contains('active') || getComputedStyle(document.getElementById('screen-game')).display`));
await client.close();
