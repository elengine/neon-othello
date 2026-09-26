// v2.1.4/2.1.5 検証（SW除去→生配信確認）
import CDP from 'chrome-remote-interface';
import fs from 'node:fs';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Runtime.enable(); await Page.enable();
await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => {
  const r = await Runtime.evaluate({ expression: '(async()=>{' + expr + '})()', awaitPromise: true, returnByValue: true, timeout: 8000 });
  if (r.exceptionDetails) return 'EXC: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 200);
  return r.result?.value;
};
await Page.navigate({ url: 'http://127.0.0.1:4321/?sw=' + Date.now() });
await new Promise(r => setTimeout(r, 1500));
console.log(await ev(`const regs=await navigator.serviceWorker.getRegistrations(); for(const r of regs) await r.unregister(); for(const k of await caches.keys()) await caches.delete(k); return 'sw cleared:' + regs.length`));
await Page.navigate({ url: 'http://127.0.0.1:4321/?fresh=' + Date.now() });
await new Promise(r => setTimeout(r, 1500));
console.log('ver:', await ev("return document.getElementById('app-version').textContent"));
// 文字拡大模擬 1.45x（見出し・戦績・バッジ）
console.log('card:', await ev(`
  const mul=1.45;
  ['account-name','account-lv'].forEach(id=>{const e=document.getElementById(id); e.style.fontSize=(parseFloat(getComputedStyle(e).fontSize)*mul)+'px';});
  const on=document.querySelector('.account-on'); on.style.fontSize=(parseFloat(getComputedStyle(on).fontSize)*mul)+'px';
  document.getElementById('btn-login').classList.add('hidden');
  document.getElementById('account-card').classList.remove('hidden');
  document.getElementById('account-name').textContent='黒田達夫';
  document.getElementById('account-lv').textContent='Lv3 見習い・5勝10敗';
  await new Promise(r=>setTimeout(r,80));
  const small=document.querySelector('.account-info small');
  const card=document.getElementById('account-card').getBoundingClientRect();
  const badge=on.getBoundingClientRect();
  return JSON.stringify({cardH:Math.round(card.height), badgeInside: badge.right<=card.right+1, smallRects: small.getClientRects().length});`));
console.log('banner:', await ev(`
  let b=document.getElementById('update-banner');
  if(!b){b=document.createElement('div'); b.id='update-banner'; document.body.appendChild(b);}
  b.textContent='アプリの新しいバージョンがあります。タップで更新';
  b.style.fontSize='22.5px';
  await new Promise(r=>setTimeout(r,80));
  const r=b.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.x), right:Math.round(r.right), vw:innerWidth, h:Math.round(r.height), visibleFull: r.x>=-0.5 && r.right<=innerWidth+0.5});`));
console.log('hist:', await ev(`
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-ranking').classList.add('active');
  const ul=document.getElementById('history-list'); ul.innerHTML='';
  for(const nm of ['黒田達夫','satooooooo-nagaimu','さと']){
    const li=document.createElement('li'); li.className='hist-item';
    const d1=document.createElement('div'); d1.className='hist-line1';
    const dt=document.createElement('span'); dt.className='hist-date'; dt.textContent='9/26 17:33';
    const md=document.createElement('span'); md.className='hist-mode'; md.textContent=nm;
    md.style.fontSize=(parseFloat(getComputedStyle(md).fontSize)*1.45)+'px';
    d1.append(dt,md);
    const d2=document.createElement('div'); d2.className='hist-line2';
    d2.innerHTML='<span class="hist-result r-lose">負け</span><span class="hist-score">0-20・16手</span><span class="hist-xp">+51</span>';
    li.append(d1,d2); ul.appendChild(li);
  }
  await new Promise(r=>setTimeout(r,80));
  const res=[...ul.querySelectorAll('.hist-mode')].map(n=>({t:n.textContent.slice(0,6), lines:n.getClientRects().length, clipped:n.scrollWidth>n.clientWidth+1}));
  return JSON.stringify(res);`));
// トースト（v2.1.5）: 'あなたが先手です'表示・2秒・タップ消去・'パス！'化けない
console.log('toast:', await ev(`
  document.getElementById('screen-title').classList.add('active');
  const t=document.getElementById('pass-toast');
  t.textContent='あなたが先手です'; t.classList.add('show');
  const fs=getComputedStyle(t).fontSize;
  await new Promise(r=>setTimeout(r,300));
  const stillText=t.textContent;
  t.click();
  await new Promise(r=>setTimeout(r,100));
  return JSON.stringify({fontSize:fs, tapCleared: !t.classList.contains('show'), stillText});`));
try {
  const s2 = await Page.captureScreenshot({ captureBeyondViewport:false });
  fs.writeFileSync('/tmp/v215-title.png', Buffer.from(s2.data,'base64'));
  console.log('shot saved');
} catch(e) { console.log('shot skip:', e.message.slice(0,60)); }
await client.close();
