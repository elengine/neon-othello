// 空状態表示の検証（ServiceWorkerキャッシュ無効のため新タブ+cache bypass）
import CDP from 'chrome-remote-interface';
import fs from 'fs';

const run = async () => {
  const client = await CDP({ port: 9222 });
  const { Page, Runtime, Emulation, Network } = client;
  await Page.enable(); await Network.enable();
  await Network.clearBrowserCache();
  await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await Page.navigate({ url: 'http://127.0.0.1:4173/?nocache=' + Date.now() });
  await new Promise((r) => setTimeout(r, 1500));
  const evalJs = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result?.value;
  await evalJs(`(() => { navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())); return 1; })()`);
  await Page.navigate({ url: 'http://127.0.0.1:4173/?r=' + Date.now() });
  await new Promise((r) => setTimeout(r, 1200));
  await evalJs(`document.getElementById('btn-ranking').click()`);
  await new Promise((r) => setTimeout(r, 800));
  console.log('ranking:', await evalJs(`document.getElementById('rank-list').textContent.slice(0,40)`));
  await evalJs(`document.getElementById('btn-online').click()`);
  await new Promise((r) => setTimeout(r, 500));
  console.log('online-toast:', await evalJs(`document.getElementById('pass-toast').textContent`));
  await Page.captureScreenshot({ format: 'png' }).then((s) => fs.writeFileSync('/tmp/oth_rank_empty.png', Buffer.from(s.data, 'base64')));
  await client.close();
};
run().catch((e) => { console.error('ERR', e.message); process.exit(1); });
