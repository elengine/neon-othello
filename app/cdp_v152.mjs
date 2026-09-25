// v1.5.2: パスToast文字サイズ検証（SW除去込み）
import CDP from 'chrome-remote-interface';
const client = await CDP();
const { Page, Runtime } = client;
await Runtime.enable(); await Page.enable();
await Page.navigate({ url: 'http://localhost:8140/' });
await new Promise(r => setTimeout(r, 1500));
const ev = async (expr) => (await Runtime.evaluate({ expression: `(async () => {${expr}})()`, awaitPromise: true, returnByValue: true })).result.value;
await ev(`const regs=await navigator.serviceWorker.getRegistrations(); for(const r of regs) await r.unregister(); const ks=await caches.keys(); for(const k of ks) await caches.delete(k); return 1`);
await Page.navigate({ url: 'http://localhost:8140/?nc=2' });
await new Promise(r => setTimeout(r, 2200));
console.log(await ev(`
  const t = document.getElementById('pass-toast');
  t.classList.add('show');
  const cs = getComputedStyle(t);
  return JSON.stringify({ fs: cs.fontSize, fw: cs.fontWeight, ver: window.__APP_VERSION__ ?? document.querySelector('.ver')?.textContent ?? '' });`));
await client.close();
