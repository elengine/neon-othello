import CDP from 'chrome-remote-interface';
import fs from 'fs';
const client = await CDP();
const {Page, Runtime, Emulation} = client;
await Runtime.enable(); await Page.enable();
await Emulation.setDeviceMetricsOverride({width:1000,height:1400,deviceScaleFactor:1,mobile:false});
await Page.navigate({url:'http://localhost:8140/font-samples.html'});
await new Promise(r=>setTimeout(r,15000)); // webフォント部分ファイル読込待ち(長め)
const info=(await Runtime.evaluate({expression:`JSON.stringify({sheets:[...document.styleSheets].map(s=>(s.href||'inline').slice(0,55)), h:document.body.scrollHeight})`,returnByValue:true})).result.value;
console.log('info:', info);
const h=1400;
await Emulation.setDeviceMetricsOverride({width:1000,height:h+40,deviceScaleFactor:1.5,mobile:false});
await new Promise(r=>setTimeout(r,1000));
try { const shot=await Page.captureScreenshot({format:'png'}); fs.writeFileSync('/tmp/font-samples-top.png',Buffer.from(shot.data,'base64')); console.log('shot1 ok'); } catch(e){ console.log('shot1 fail', e.message); }
await Runtime.evaluate({expression:`window.scrollTo(0,1350); return 1`,returnByValue:true}).catch(()=>{});
await Runtime.evaluate({expression:'(()=>{document.querySelector(".f4").scrollIntoView();return 1})()'});
await new Promise(r=>setTimeout(r,400));
try { const shot=await Page.captureScreenshot({format:'png'}); fs.writeFileSync('/tmp/font-samples-bot.png',Buffer.from(shot.data,'base64')); console.log('shot2 ok'); } catch(e){ console.log('shot2 fail', e.message); }
await client.close();
