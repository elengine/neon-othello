// v2.1.1 調査専用②: 要素を直接アクティブにして待機トグルの幾何を実測
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime } = client;
await Runtime.enable(); await Page.enable();
await Page.navigate({ url: 'http://127.0.0.1:4321/?diag=3' });
await new Promise(r => setTimeout(r, 1500));
const ev = async (expr) => (await Runtime.evaluate({ expression: `(async () => {${expr}})()`, awaitPromise: true, returnByValue: true })).result.value;
console.log(await ev(`
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-lobby').classList.add('active');
  const chk = document.getElementById('chk-wait');
  chk.checked = true;
  document.getElementById('wait-card').classList.add('on');
  const st = document.getElementById('lobby-status');
  st.className='lobby-status on'; st.innerHTML='<span class=\"ico\">📡</span><span>ただいま待機中！ 相手からの招待をお待ちしています</span><span class=\"pulse\"></span>';
  await new Promise(r=>setTimeout(r,300));
  const wrap = chk.closest('.sw');
  const cs = getComputedStyle(chk);
  const w = wrap.getBoundingClientRect(), c = chk.getBoundingClientRect(), rr = document.getElementById('wait-card').getBoundingClientRect(), s = st.getBoundingClientRect();
  const thumb = cs.getPropertyValue('--x');
  return JSON.stringify({
    vw: innerWidth,
    wrapBox: [w.x,w.y,w.width,w.height].map(v=>+v.toFixed(1)),
    inputBox: [c.x,c.y,c.width,c.height].map(v=>+v.toFixed(1)),
    borderWidth: cs.borderTopWidth+'/'+cs.borderRightWidth+'/'+cs.borderBottomWidth+'/'+cs.borderLeftWidth,
    bgOrigin: cs.backgroundOrigin, bgClip: cs.backgroundClip, shadow: cs.boxShadow,
    rowBottom: +rr.bottom.toFixed(1), statusTop: +s.y.toFixed(1), gap: +(s.y-rr.bottom).toFixed(1),
    statusH: +s.height.toFixed(1)
  });`));
await client.close();
