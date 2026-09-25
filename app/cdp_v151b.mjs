// SW・Cacheを完全除去してから v1.5.1 検証を再実行
import CDP from 'chrome-remote-interface';
const client = await CDP();
const { Page, Runtime, Emulation, Input } = client;
await Runtime.enable(); await Page.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
await Page.navigate({ url: 'http://localhost:8140/' });
await new Promise(r => setTimeout(r, 2000));
const ev = async (expr) => (await Runtime.evaluate({ expression: `(async () => {${expr}})()`, awaitPromise: true, returnByValue: true })).result.value;
console.log('cleared:', await ev(`
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  const keys = await caches.keys();
  for (const k of keys) await caches.delete(k);
  return regs.length + '+' + keys.length;`));
await Page.navigate({ url: 'http://localhost:8140/?nocache=1' });
await new Promise(r => setTimeout(r, 2500));
const tap = async (x, y) => {
  await Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await new Promise(r => setTimeout(r, 60));
  await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });
  await new Promise(r => setTimeout(r, 250));
};
const center = async (sel) => JSON.parse(await ev(`const r=document.querySelector('${sel}').getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})`));
console.log('result btn:', await ev(`return document.getElementById('btn-result-title').textContent`));
const b = await center('#btn-ai'); await tap(b.x, b.y);
const l = await center('[data-level="1"]'); await tap(l.x, l.y);
await new Promise(r => setTimeout(r, 400));
const g = JSON.parse(await ev(`const r=document.getElementById('board').getBoundingClientRect(); return JSON.stringify({left:r.left,top:r.top,cell:r.width/8})`));
await tap(g.left + 4.5 * g.cell, g.top + 2.5 * g.cell);
await new Promise(r => setTimeout(r, 2500));
console.log('me-name after move:', await ev(`return document.getElementById('hud-me-name').textContent`));
await client.close();
