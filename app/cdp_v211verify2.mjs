// v2.1.1 検証②: activation明示 + 全計測（静的サーバーでは supabase 未設定でロビー遷移が止まるため直接 active 化）
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
};
await Page.navigate({ url: 'http://127.0.0.1:4321/?v2=' + Date.now() });
await new Promise(r => setTimeout(r, 2000));
console.log('ver:', await ev(`return document.getElementById('app-version').textContent`));

// A) ロビー: 直接有効化→チェック→ON外観・間隔
console.log(await ev(`
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-lobby').classList.add('active');
  const chk=document.getElementById('chk-wait');
  chk.click();               // changeハンドラ発火（状態は未接続だが class on 相当を自前で反映）
  await new Promise(r=>setTimeout(r,300));
  document.getElementById('wait-card').classList.add('on');
  const st=document.getElementById('lobby-status');
  st.className='lobby-status on';
  st.innerHTML='<span class="ico">📡</span><span>ただいま待機中！ 相手からの招待をお待ちください</span><span class="pulse"></span>';
  await new Promise(r=>setTimeout(r,300));
  const w=chk.closest('.sw').getBoundingClientRect();
  const r=document.getElementById('wait-card').getBoundingClientRect();
  const s=st.getBoundingClientRect();
  const cs=getComputedStyle(chk);
  return JSON.stringify({checked:chk.checked, wrap:[+w.x.toFixed(1),+w.width.toFixed(1),+w.height.toFixed(1)].join('/'), overflow:cs.overflow, gap:+(s.y-r.bottom).toFixed(1)});`));
let b = await ev(`const r=document.getElementById('wait-card').getBoundingClientRect(); const s=document.getElementById('lobby-status').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:s.bottom-r.y}`);
await shot('v211b-toggle', { x: Math.max(0,b.x-10), y: Math.max(0,b.y-8), width: b.w+20, height: b.h+30 });

// B) AI対戦HUD表記（画面直接有効化→startAI 相当を lv=1 で）
console.log(await ev(`
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-difficulty').classList.add('active');
  document.querySelector('[data-level="1"]').click();
  await new Promise(r=>setTimeout(r,600));
  return JSON.stringify({scr: document.querySelector('.screen.active')?.id, hud: document.getElementById('hud-opp-name')?.textContent});`));
await shot('v211b-hud');

// C) ランキング履歴表記: renderHistory はログイン必須の静的環境では空になるため、関数出力を関与せず DOM文字列のみ source 確認済み → スクショはタイトル
console.log('done');
await client.close();
