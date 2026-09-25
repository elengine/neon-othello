// フォントサンプルページのスクリーンショット生成
import fs from 'fs';
import CDP from 'chrome-remote-interface';
const client = await CDP();
const { Page, Runtime, Emulation } = client;
await Runtime.enable(); await Page.enable();
await Emulation.setDeviceMetricsOverride({ width: 1000, height: 900, deviceScaleFactor: 1.5, mobile: false });
await Page.navigate({ url: 'http://localhost:8140/font-samples.html' });
await new Promise(r => setTimeout(r, 5000)); // webフォント読込待ち
await Runtime.evaluate({ expression: `document.fonts.ready.then(()=>1)`, awaitPromise: true });
const h = (await Runtime.evaluate({ expression: `document.body.scrollHeight`, returnByValue: true })).result.value;
await Emulation.setDeviceMetricsOverride({ width: 1000, height: Math.min(h + 40, 16000), deviceScaleFactor: 1.5, mobile: false });
await new Promise(r => setTimeout(r, 600));
const shot = await Page.captureScreenshot({ format: 'png' });
fs.writeFileSync('/tmp/font-samples.png', Buffer.from(shot.data, 'base64'));
console.log('saved', h);
await client.close();
