// 待機トグルON状態を拡大キャプチャして現行デザインの実物観察
import CDP from 'chrome-remote-interface';
import fs from 'node:fs';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation, DOM } = client;
await Runtime.enable(); await Page.enable();
await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await Page.navigate({ url: 'http://127.0.0.1:4321/?shot=1' });
await new Promise(r => setTimeout(r, 1500));
const ev = async (expr) => (await Runtime.evaluate({ expression: `(async () => {${expr}})()`, awaitPromise: true, returnByValue: true })).result.value;
await ev(`
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-lobby').classList.add('active');
  const chk = document.getElementById('chk-wait');
  chk.checked = true;
  document.getElementById('wait-card').classList.add('on');
  const st = document.getElementById('lobby-status');
  st.className='lobby-status on';
  st.innerHTML='<span class="ico">📡</span><span>ただいま待機中！ 相手からの招待をお待ちください</span><span class="pulse"></span>';
  return 1;`);
await new Promise(r => setTimeout(r, 400));
// トグル〜ステータス行をトリミング
const b = await ev(`const r=document.getElementById('wait-card').getBoundingClientRect(); const s=document.getElementById('lobby-status').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:s.bottom-r.y}`);
const shot = await Page.captureScreenshot({ clip: { x: Math.max(0,b.x-10), y: Math.max(0,b.y-8), width: b.w+20, height: b.h+30, scale: 1 }, captureBeyondViewport: false });
fs.writeFileSync('/tmp/toggle_v210.png', Buffer.from(shot.data, 'base64'));
console.log('saved', b);
await client.close();
