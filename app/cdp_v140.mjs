// v1.4.0 検証: オンラインロビー再設計（DBポーリング・自分行表示・同色ガード回帰）
import CDP from 'chrome-remote-interface';
const client = await CDP();
const { Page, Runtime, Console } = client;
await Runtime.enable(); await Page.enable();
const errs = [];
Runtime.on('exceptionThrown', (e) => errs.push(String(e?.exceptionDetails?.exception?.description ?? '')));
await Page.navigate({ url: 'http://localhost:8140/' });
await new Promise(r => setTimeout(r, 3000));
const ev = async (expr) => (await Runtime.evaluate({ expression: `(() => {${expr}})()`, returnByValue: true })).result.value;

console.log('title loads:', await ev(`return !!document.getElementById('btn-online')`));
// 未ログインでオンラインボタン → トースト（クラッシュしない）
console.log('online btn no-crash:', await ev(`document.getElementById('btn-online').click(); return true`));
await new Promise(r => setTimeout(r, 600));
console.log('toast:', await ev(`return document.getElementById('pass-toast')?.textContent`));
// 設定画面: 同色ガード回帰
await ev(`document.getElementById('btn-settings').click(); return true`);
await new Promise(r => setTimeout(r, 400));
console.log('same-color guard:', await ev(`
  const b = document.getElementById('pick-black'), w = document.getElementById('pick-white');
  b.value = w.value; b.dispatchEvent(new Event('input', { bubbles: true }));
  return JSON.stringify({ rolledBack: b.value !== w.value, toast: document.getElementById('pass-toast')?.textContent });`));
console.log('marker UI still removed:', await ev(`return !document.getElementById('mk-ring')`));
console.log('JS exceptions:', errs.length ? errs.slice(0,3).join(' || ') : 'none');
await client.close();
