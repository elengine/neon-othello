// v2.1.1 検証: トグルON外観 / 間隔 / ログアウト最下部 / HUD表記「AI 見習い」
import CDP from 'chrome-remote-interface';
import fs from 'node:fs';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Runtime.enable(); await Page.enable();
await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: `(async () => {${expr}})()`, awaitPromise: true, returnByValue: true })).result.value;
const shot = async (name, clip) => {
  const s = clip ? await Page.captureScreenshot({ clip: { ...clip, scale: 1 }, captureBeyondViewport: false })
                 : await Page.captureScreenshot({ captureBeyondViewport: false });
  fs.writeFileSync(`/tmp/${name}.png`, Buffer.from(s.data, 'base64'));
  console.log('saved /tmp/' + name + '.png');
};
await Page.navigate({ url: 'http://127.0.0.1:4321/?v=211a' });
await new Promise(r => setTimeout(r, 1500));
await ev(`const regs=await navigator.serviceWorker.getRegistrations(); for(const r of regs) await r.unregister(); for(const k of await caches.keys()) await caches.delete(k); return 1`);
await Page.navigate({ url: 'http://127.0.0.1:4321/?v=211b' });
await new Promise(r => setTimeout(r, 1800));
console.log('ver:', await ev(`document.getElementById('app-version').textContent`));

// A) ロビートグルON（実クリック経由）
console.log(await ev(`
  document.getElementById('btn-online').click();
  await new Promise(r=>setTimeout(r,500));
  const chk=document.getElementById('chk-wait');
  chk.click();
  await new Promise(r=>setTimeout(r,500));
  const w=chk.closest('.sw').getBoundingClientRect();
  const r=document.getElementById('wait-card').getBoundingClientRect();
  const s=document.getElementById('lobby-status').getBoundingClientRect();
  return JSON.stringify({checked:chk.checked, wrap:[+w.x.toFixed(1),+w.width,w.height].join(','), gapStatus:+(s.y-r.bottom).toFixed(1)});`));
let b = await ev(`const r=document.getElementById('wait-card').getBoundingClientRect(); const s=document.getElementById('lobby-status').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:s.bottom-r.y}`);
await shot('v211-toggle', { x: Math.max(0,b.x-10), y: Math.max(0,b.y-8), width: b.w+20, height: b.h+30 });

// B) AI対戦 HUD 表記
await ev(`document.getElementById('back-lobby').click(); await new Promise(r=>setTimeout(r,300)); document.getElementById('btn-ai').click(); await new Promise(r=>setTimeout(r,300)); document.querySelector('[data-level="1"]').click(); await new Promise(r=>setTimeout(r,500)); return 1`);
console.log('hud:', await ev(`document.getElementById('hud-opp-name').textContent`));
await shot('v211-hud');

// C) タイトル画面・ログアウト最下部（ログイン想定のクラス操作はせず、まず非ログイン状態の全体図）
await ev(`document.getElementById('btn-quit')?.click(); return 1`);
await ev(`return (document.getElementById('btn-resign').click(), 1)`).catch(()=>{});
await new Promise(r => setTimeout(r, 600));
console.log('screen now:', await ev(`document.querySelector('.screen.active')?.id`));
await ev(`document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById('screen-title').classList.add('active');
  document.getElementById('btn-login').classList.add('hidden');
  document.getElementById('account-card').classList.remove('hidden');
  document.getElementById('account-name').textContent='さと';
  document.getElementById('account-lv').textContent='Lv2 見習い・9勝3敗';
  document.getElementById('btn-logout').classList.remove('hidden'); return 1`);
await new Promise(r => setTimeout(r, 300));
console.log(await ev(`
  const lo=document.getElementById('btn-logout').getBoundingClientRect();
  const sub=document.querySelector('.menu-sub').getBoundingClientRect();
  const sc=document.getElementById('screen-title').getBoundingClientRect();
  return JSON.stringify({logoutTop:+lo.y.toFixed(0), subBottom:+sub.bottom.toFixed(0), screenBottom:+sc.bottom.toFixed(0), gapBetween:+(lo.y-sub.bottom).toFixed(0), gapBelow:+(sc.bottom-lo.bottom).toFixed(0)});`));
await shot('v211-title');
await client.close();
