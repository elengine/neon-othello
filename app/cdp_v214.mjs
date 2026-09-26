// v2.1.4 案A検証: 文字拡大端末を模擬（全テキスト1.45倍）して折返し・見切れを計測
import CDP from 'chrome-remote-interface';
import fs from 'node:fs';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Runtime.enable(); await Page.enable();
await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: `(async () => {${expr}})()`, awaitPromise: true, returnByValue: true })).result.value;
await Page.navigate({ url: 'http://127.0.0.1:4321/?v214=' + Date.now() });
await new Promise(r => setTimeout(r, 1800));
// 文字拡大模擬: 全要素のfont-sizeを1.45倍（Android「largest」相当の膨らみ）
await ev(`
  const mul = 1.45;
  const st = document.createElement('style'); st.id='bigtext';
  st.textContent = \`.account-info b{font-size:${'21px'}}\`; // placeholder
  document.head.appendChild(st);
  document.querySelectorAll('.account-info b,.account-info small,.account-on,.btn,button,.hist-item,.lobby-status,.version,#update-banner,.login-main').forEach(el=>{
    el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize)*mul)+'px';
  });
  return 1`);
// A) アカウントカード: バッジが折り返さず2行目に回るか（戦績nowrap）
console.log('card:', await ev(`
  document.getElementById('btn-login').classList.add('hidden');
  document.getElementById('account-card').classList.remove('hidden');
  document.getElementById('account-name').textContent='黒田達夫';
  document.getElementById('account-lv').textContent='Lv3 見習い・5勝10敗';
  const info=document.querySelector('.account-info small');
  const r=info.getClientRects();
  const card=document.getElementById('account-card').getBoundingClientRect();
  const badge=document.querySelector('.account-on').getBoundingClientRect();
  return JSON.stringify({cardH:+card.height.toFixed(0), badgeX:+badge.x.toFixed(0), badgeW:+badge.width.toFixed(0), infoLines:r.length, smallTextW:+info.getBoundingClientRect().width.toFixed(0), cardW:+card.width.toFixed(0), badgeInside: badge.right<=card.right+1});`));
// B) 更新バナー: 見切れ（左右断片化）がないか
console.log('banner:', await ev(`
  let b=document.getElementById('update-banner');
  if(!b){ b=document.createElement('div'); b.id='update-banner'; document.body.appendChild(b);}
  b.textContent='⬆ アプリの新しいバージョンがあります。タップで更新';
  b.style.fontSize='22.5px';
  await new Promise(r=>setTimeout(r,100));
  const r=b.getBoundingClientRect();
  const lines=b.getClientRects().length;
  return JSON.stringify({x:+r.x.toFixed(0), right:+r.right.toFixed(0), vw:innerWidth, width:+r.width.toFixed(0), h:+r.height.toFixed(0), visibleFull: r.x>=0 && r.right<=innerWidth});`));
// C) 履歴2行レイアウト: 1件あたりhist-line1/line2、名前が折り返さない
console.log('hist:', await ev(`
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-ranking').classList.add('active');
  const ul=document.getElementById('history-list');
  ul.innerHTML='';
  for(const nm of ['黒田達夫','satooooooo-nagaimu','さと']){
    const li=document.createElement('li'); li.className='hist-item';
    li.innerHTML=\`<div class="hist-line1"><span class="hist-date">9/26 17:33</span><span class="hist-mode">\${nm}</span></div><div class="hist-line2"><span class="hist-result r-lose">負け</span><span class="hist-score">0-20・16手</span><span class="hist-xp">+51</span></div>\`;
    ul.appendChild(li);
  }
  await new Promise(r=>setTimeout(r,100));
  const items=[...ul.children];
  const res=items.map(li=>{ const name=li.querySelector('.hist-mode'); const r1=name.getClientRects().length; const cs=getComputedStyle(name);
    return {name:name.textContent.slice(0,8), nameRectLines:r1, clipped: name.scrollWidth>name.clientWidth+1, ellipsis: cs.textOverflow}; });
  return JSON.stringify({itemH:+items[0].getBoundingClientRect().height.toFixed(0), res});`));
// スクショ
const s1 = await Page.captureScreenshot({ clip:{x:0,y:0,width:390,height:260,scale:1}, captureBeyondViewport:false });
fs.writeFileSync('/tmp/v214-card.png', Buffer.from(s1.data,'base64'));
await ev(`document.getElementById('screen-ranking').scrollTop=0; scrollTo(0, 0); return 1`);
await ev(`document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById('screen-title').classList.add('active'); return 1`);
await new Promise(r=>setTimeout(r,200));
const s2 = await Page.captureScreenshot({ captureBeyondViewport:false });
fs.writeFileSync('/tmp/v214-title.png', Buffer.from(s2.data,'base64'));
console.log('shots saved');
await client.close();
