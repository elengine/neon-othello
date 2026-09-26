// v2.1.1 調査専用: 現行v2.1.0ビルドの待機トグル実測（修正前に仮説検証）
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime } = client;
await Runtime.enable(); await Page.enable();
await Page.navigate({ url: 'http://127.0.0.1:4321/?diag=1' });
await new Promise(r => setTimeout(r, 1800));
const ev = async (expr) => (await Runtime.evaluate({ expression: `(async () => {${expr}})()`, awaitPromise: true, returnByValue: true })).result.value;
await ev(`const regs=await navigator.serviceWorker.getRegistrations(); for(const r of regs) await r.unregister(); const ks=await caches.keys(); for(const k of ks) await caches.delete(k); return 1`);
await Page.navigate({ url: 'http://127.0.0.1:4321/?diag=2' });
await new Promise(r => setTimeout(r, 2000));
console.log('ver:', await ev(`window.__APP_VERSION__ ?? document.getElementById('app-version')?.textContent`));
// ロビー画面を開いて ON 状態を実測
console.log(await ev(`
  document.getElementById('btn-online')?.click();
  await new Promise(r=>setTimeout(r,600));
  const chk = document.getElementById('chk-wait');
  const wrap = chk.closest('.sw');
  const row = document.getElementById('wait-card');
  const st = document.getElementById('lobby-status');
  chk.click();
  await new Promise(r=>setTimeout(r,400));
  const cs = getComputedStyle(chk);
  const w = wrap.getBoundingClientRect(), c = chk.getBoundingClientRect(), rr = row.getBoundingClientRect(), s = st.getBoundingClientRect();
  const b = parseFloat(cs.borderTopWidth);
  return JSON.stringify({
    checked: chk.checked,
    wrapBox: [w.x,w.y,w.width,w.height].map(v=>+v.toFixed(1)),
    inputBox: [c.x,c.y,c.width,c.height].map(v=>+v.toFixed(1)),
    borderTop: b, borderLeft: parseFloat(cs.borderLeftWidth),
    bgClip: cs.backgroundClip, boxShadow: cs.boxShadow,
    grad: cs.backgroundImage.slice(0,60),
    rowBox: [rr.x,rr.width].map(v=>+v.toFixed(1)),
    statusTop: +s.y.toFixed(1), rowBottom: +rr.bottom.toFixed(1), gap: +(s.y-rr.bottom).toFixed(1),
    statusVisible: st.className, statusText: st.textContent.trim().slice(0,30)
  }, null, 1);`));
// ログアウト位置（タイトル画面）
console.log(await ev(`
  document.getElementById('back-lobby')?.click();
  await new Promise(r=>setTimeout(r,300));
  const lo = document.getElementById('btn-logout');
  const sub = document.querySelector('.menu-sub');
  const scr = document.getElementById('screen-title');
  const l = lo.getBoundingClientRect(), sb = sub.getBoundingClientRect(), sc = scr.getBoundingClientRect();
  return JSON.stringify({ logoutHidden: lo.classList.contains('hidden'), logoutOrder: getComputedStyle(lo).order,
    logoutY: +l.y.toFixed(0), subBottom: +sb.bottom.toFixed(0), screenBottom: +sc.bottom.toFixed(0),
    gapToBottom: +(sc.bottom - l.bottom).toFixed(0) });`));
await client.close();
