// fonts samples 撮影（file:// 起動でSW回避・長待ち）
import CDP from 'chrome-remote-interface';
import fs from 'fs';
const client = await CDP();
const {Page, Runtime, Emulation} = client;
await Runtime.enable(); await Page.enable();
await Emulation.setDeviceMetricsOverride({width:1000,height:1200,deviceScaleFactor:1,mobile:false});
await Page.navigate({url:'file:///tmp/fontsample/index.html'});
await new Promise(r=>setTimeout(r,20000));
const info=(await Runtime.evaluate({expression:`JSON.stringify({sheets:[...document.styleSheets].map(s=>(s.href||'inline').slice(0,55)), loaded:[...new Set([...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family))]})`,returnByValue:true})).result.value;
console.log('info:', info);
await Emulation.setDeviceMetricsOverride({width:1000,height:6400,deviceScaleFactor:1.4,mobile:false});
await new Promise(r=>setTimeout(r,1500));
const shot=await Page.captureScreenshot({format:'png', captureBeyondViewport:true});
fs.writeFileSync('/tmp/font-samples.png',Buffer.from(shot.data,'base64'));
console.log('saved /tmp/font-samples.png');
await client.close();
