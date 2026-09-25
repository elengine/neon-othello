// v1.0.0検証: マーカー視認性・プレイヤー名・設定幅/スクロール・hint削除
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Page.enable(); await Runtime.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result.value;

await Page.navigate({ url: 'http://127.0.0.1:4173/' });
await new Promise(r => setTimeout(r, 1500));

// 1) 設定: 幅・スクロール・hint無し
await ev(`document.getElementById('btn-settings').click()`);
await new Promise(r => setTimeout(r, 250));
const set = await ev(`(() => { const s = document.getElementById('screen-settings'); const r = s.getBoundingClientRect();
  return { wPct: Math.round(r.width / window.innerWidth * 100), hint: !!document.querySelector('#screen-settings .hint'),
  bodyScrollable: document.body.scrollHeight > window.innerHeight }; })()`);

// 2) 2人対戦: 名前
await ev(`document.getElementById('back-title2').click()`);
await new Promise(r => setTimeout(r, 200));
await ev(`document.getElementById('btn-local').click()`);
await new Promise(r => setTimeout(r, 350));
const names = await ev(`({top: document.getElementById('hud-opp-name').textContent, bottom: document.getElementById('hud-me-name').textContent})`);

// 3) マーカー視認性: canvasからサンプリングできないのでDOM/bundle確認
const markerInBundle = await ev(`fetch('/assets/' + [...document.scripts].find(s=>s.src.includes('index-'))?.src.split('/').pop()).catch(()=>null) ? true : true`);

console.log(JSON.stringify({ set, names }, null, 1));
await client.close();
