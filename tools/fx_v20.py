import asyncio, json, base64, time, urllib.request
import websockets

ws_url = next(t["webSocketDebuggerUrl"] for t in json.load(urllib.request.urlopen("http://127.0.0.1:9333/json")) if t.get("type") == "page")
_id = 0

async def send(m, **p):
    global _id; _id += 1
    await ws.send(json.dumps({"id": _id, "method": m, "params": p}))
    while True:
        r = json.loads(await ws.recv())
        if r.get("id") == _id:
            if "error" in r: raise RuntimeError(r["error"])
            return r.get("result", {})

async def js(e):
    r = await send("Runtime.evaluate", expression=e, returnByValue=True, awaitPromise=True)
    if r.get("exceptionDetails"):
        raise RuntimeError("JS: " + str(r["exceptionDetails"].get("exception", {}).get("description", ""))[:200])
    return r.get("result", {}).get("value")

async def shot(name, clip=None, scale=3):
    p_ = {"format": "png"}
    if clip: p_["clip"] = {**clip, "scale": scale}
    data = (await send("Page.captureScreenshot", **p_))["data"]
    path = f"/opt/data/{name}.png"
    open(path, "wb").write(base64.b64decode(data))
    print("shot:", path)

async def main():
    global ws
    async with websockets.connect(ws_url, max_size=60_000_000) as ws:
        await send("Page.enable")
        await send("Network.setBypassServiceWorker", bypass=True)
        await send("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
        await send("Page.navigate", url="http://127.0.0.1:4321/?v20a=" + str(time.time()))
        await asyncio.sleep(2.5)
        await js("localStorage.setItem('otv2:prefs', JSON.stringify({pace:'jitter',sound:true,turnGlow:40,turnWidth:2}))")
        await send("Page.navigate", url="http://127.0.0.1:4321/?v20b=" + str(time.time()))
        await asyncio.sleep(2.5)
        await js("document.getElementById('btn-ai').click()"); await asyncio.sleep(0.5)
        await js("document.querySelector('[data-level=\"1\"]').click()"); await asyncio.sleep(1.4)
        geo = json.loads(await js("""JSON.stringify((()=>{const r=document.getElementById('board').getBoundingClientRect();return{x:r.left,y:r.top,w:r.width}})())"""))
        print("canvas rect:", geo)
        # 盤本体は pad だけ内側。pad=size*0.07+lw/2+3。size=レイアウトの盤サイズ(css)。
        # 内部: canvas全幅 geo.w から盤本体= size。padを逆算し盤左端xを確認
        padcalc = await js("""(() => {
          const c = document.getElementById('board');
          const t = c.getContext('2d').getTransform();
          // setTransform後のe,fがpad*dpr。draw後なので取得可
          return JSON.stringify({sw:c.width, sh:c.height, css:c.style.width, pad: t.e/ (t.a)});
        })()""")
        print("canvas info:", padcalc)
        # 枠帯が盤外にあること: 盤左端 -pad〜0 の帯の輝度 / 盤内0〜3pxが盤地そのものであること
        prof = await js("""(() => {
          const c = document.getElementById('board'), x = c.getContext('2d');
          const t = x.getTransform(), dpr = t.a, P = t.e / dpr, S = c.width / dpr - P * 2, cell = S / 8;
          const px = (lx, ly) => { const p = x.getImageData(Math.round(lx * dpr), Math.round(ly * dpr), 1, 1).data; return [p[0], p[1], p[2]]; };
          const cy = P + S / 2;  // 盤中央Y
          const out = {pad: Math.round(P), size: Math.round(S)};
          out.outside = [...Array(8)].map((_, i) => px(P - 8 + i, cy));      // 盤端の外側(枠帯域)
          out.frame = [...Array(6)].map((_, i) => px(P + i * 0.6, cy));       // 盤端
          out.inside = [...Array(8)].map((_, i) => px(P + 2 + i, cy));        // 盤内側
          return JSON.stringify(out);
        })()""")
        print("band profile:", prof)
        # 端マスの法律: 石の外縁が枠の内側線と接していないか: 盤端x=P+2〜+4、cell0中心行の px
        await shot("v20_whole")
        await shot("v20_topleft", {"x": geo["x"] - 6, "y": geo["y"] - 6, "width": 150, "height": 150})

asyncio.run(main())
