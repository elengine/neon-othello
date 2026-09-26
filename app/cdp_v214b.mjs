// v2.1.4 案A検証（軽量版）
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
await Page.navigate({ url: 'http://127.0.0.1:4321/?v214b=' + Date.now() });
await new Promise(r => setTimeout(r, 1500));
console.log('ver:', await ev("return document.getElementById('app-version').textContent"));

console.log('card:', await ev(`
  const mul=1.45;
  ['account-name','account-lv'].forEach(id=>{const e=document.getElementById(id); e.style.fontSize=(parseFloat(getComputedStyle(e).fontSize)*mul)+'px';});
  const on=document.querySelector('.account-on'); on.style.fontSize=(parseFloat(getComputedStyle(on).fontSize)*mul)+'px';
  document.getElementById('btn-login').classList.add('hidden');
  document.getElementById('account-card').classList.remove('hidden');
  document.getElementById('account-name').textContent='黒田達夫';
  document.getElementById('account-lv').textContent='Lv3 見習い・5勝10敗';
  await new Promise(r=>setTimeout(r,80));
  const info=document.querySelector('.account-info');
  const small=document.querySelector('.account-info small');
  const card=document.getElementById('account-card').getBoundingClientRect();
  const badge=on.getBoundingClientRect();
  return JSON.stringify({cardH:Math.round(card.height), badgeInside: badge.right<=card.right+1, badgeW:Math.round(badge.width),
    smallRects: small.getClientRects().length, infoRects: info.getClientRects().length});`));

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
  const ul=document.getElementById('history-list');
  ul.innerHTML='';
  const names=['黒田達夫','satooooooo-nagaimu','さと'];
  for(const nm of names){
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
  const itemH=[...ul.children].map(li=>Math.round(li.getBoundingClientRect().height));
  return JSON.stringify({res, itemH});`));

await ev(`document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById('screen-title').classList.add('active'); return 1`);
await new Promise(r => setTimeout(r, 200));
const s2 = await Page.captureScreenshot({ captureBeyondViewport:false });
fs.writeFileSync('/tmp/v214-title.png', Buffer.from(s2.data,'base64'));
console.log('shot saved');
await client.close();
