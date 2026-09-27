import asyncio, json, base64, time, urllib.request
import websockets
ws_url = next(t["webSocketDebuggerUrl"] for t in
    json.load(urllib.request.urlopen("http://127.0.0.1:9333/json")) if t.get("type")=="page")
_id=0
async def send(m,**p):
    global _id; _id+=1
    await ws.send(json.dumps({"id":_id,"method":m,"params":p}))
    while True:
        r=json.loads(await ws.recv())
        if r.get("id")==_id:
            if "error" in r: raise RuntimeError(f"{m}: {r['error']}")
            return r.get("result",{})
async def js(e):
    r=await send("Runtime.evaluate",expression=e,returnByValue=True)
    return r.get("result",{}).get("value")
async def shot(name):
    data=(await send("Page.captureScreenshot",format="png"))["data"]
    path=f"/opt/data/{name}.png"; open(path,"wb").write(base64.b64decode(data)); print("shot:",path)

async def main():
    global ws
    async with websockets.connect(ws_url,max_size=60_000_000) as ws:
        await send("Page.enable")
        await send("Network.setBypassServiceWorker", bypass=True)
        await send("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
        await send("Page.navigate", url="http://127.0.0.1:4321/?cb="+str(time.time()))
        await asyncio.sleep(2.5)
        print("ver:", await js("window.__APP_VERSION__"))
        await js("document.getElementById('btn-ai').click()")
        await asyncio.sleep(0.5)
        await js("document.querySelector('[data-level=\"1\"]').click()")
        await asyncio.sleep(1.2)
        # 盤枠線サンプル: キャンバス上端の枠線中心（盤中央x, 枠y）をピクセル読取
        print("glow60:", await js("""(() => {
          const c=document.getElementById('board'), r=c.getBoundingClientRect();
          return JSON.stringify([r.left, r.top, r.width, r.height]);
        })()"""))
        await shot("v15_glow60")
        # 設定画面で0にして盤へ戻り、枠線が消えることを確認
        await js("document.getElementById('btn-pause').click(); document.getElementById('btn-quit').click()")
        await asyncio.sleep(0.6)
        await js("document.getElementById('btn-settings').click()")
        await asyncio.sleep(0.5)
        print("range visible:", await js("!!document.getElementById('rng-turnglow')"))
        await js("""(() => { const g=document.getElementById('rng-turnglow'); g.value='0'; g.dispatchEvent(new Event('input',{bubbles:true})); return true; })()""")
        print("val label:", await js("document.getElementById('turnglow-val').textContent"))
        await shot("v15_settings")
        # 対局再開
        await js("document.getElementById('back-title2').click()")
        await asyncio.sleep(0.4)
        await js("document.getElementById('btn-ai').click()")
        await asyncio.sleep(0.4)
        await js("document.querySelector('[data-level=\"1\"]').click()")
        await asyncio.sleep(1.0)
        await shot("v15_glow0")
        # canvas枠線ピクセル比較 (glow0時点)
        print("edgepx:", await js("""(() => {
          const c=document.getElementById('board'), x=c.getContext('2d');
          // 枠線はdpr変換後なので getTransform経由で論理座標→実座標
          const t=x.getTransform(); const px=(lx,ly)=>{const p=x.getImageData(Math.round(t.a*lx),Math.round(t.d*ly),1,1).data;return [p[0],p[1],p[2]];};
          return JSON.stringify({top:px(c.width/ (t.a), 2), left:[...px(2, c.height/t.d/2)]});
        })()"""))

asyncio.run(main())
