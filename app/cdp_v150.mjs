// v1.5.0 検証: トグル寸法/招待ハンドリング文字列/デグレ
import CDP from 'chrome-remote-interface';
const client = await CDP();
const { Page, Runtime } = client;
await Runtime.enable(); await Page.enable();
await Page.navigate({ url: 'http://localhost:8140/' });
await new Promise(r => setTimeout(r, 2500));
const ev = async (expr) => (await Runtime.evaluate({ expression: `(() => {${expr}})()`, returnByValue: true })).result.value;
await ev(`document.getElementById('btn-settings').click(); return true`);
await new Promise(r => setTimeout(r, 400));
console.log('toggle box:', await ev(`
  const el = document.querySelector('#chk-icon');
  const r = el.getBoundingClientRect();
  return JSON.stringify({w: Math.round(r.width), h: Math.round(r.height)});`));
console.log('no crash / screens ok:', await ev(`return !!document.getElementById('invite-modal') && !!document.getElementById('lobby-me')`));
await client.close();
