import asyncio, json, base64, time, urllib.request, sys
sys.path.insert(0, '/opt/share/othello/app')
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
        raise RuntimeError("JS: " + json.dumps(r["exceptionDetails"].get("exception", {}).get("description", ""))[:200])
    return r.get("result", {}).get("value")

async def shot(name, clip=None, scale=4):
    p_ = {"format": "png"}
    if clip: p_["clip"] = {**clip, "scale": scale}
    data = (await send("Page.captureScreenshot", **p_))["data"]
    path = f"/opt/data/{name}.png"
    open(path, "wb").write(base64.b64decode(data))
    print("shot:", path)

# キャンバス内部を論理走査: 各マスの中心輝度で石判定、枠線プロファイル取得
PROBE = r"""(() => {
  const c=document.getElementById('board'), x=c.getContext('2d');
  const t=x.getTransform(), d=t.a, W=c.width/d, cell=W/8;
  const px=(lx,ly)=>{const p=x.getImageData(Math.round(lx*d),Math.round(ly*d),1,1).data;return [p[0],p[1],p[2]];};
  window.__probe = {px, cell, W};
  const stones=[];
  for (let cy=0;cy<8;cy++) for (let cx=0;cx<8;cx++){
    const q=px((cx+0.5)*cell,(cy+0.5)*cell);
    if (q[0]+q[1]+q[2]>330) stones.push([cx,cy,q]);
  }
  return JSON.stringify(stones);
})()"""

# 合法マーカー(盤地と違う彩度+白リング)を検出して優先端マスを選ぶ
DOTS = r"""(() => {
  const c=document.getElementById('board'), x=c.getContext('2d');
  const t=x.getTransform(), d=t.a, W=c.width/d, cell=W/8;
  const px=(lx,ly)=>{const p=x.getImageData(Math.round(lx*d),Math.round(ly*d),1,1).data;return [p[0],p[1],p[2]];};
  const rect=c.getBoundingClientRect();
  const out=[];
  for (let cy=0;cy<8;cy++) for (let cx=0;cx<8;cx++){
    const ex=(cx+0.5)*cell, ey=(cy+0.5)*cell;
    const core=px(ex,ey), up=px(ex,ey-cell*0.30);
    const sat=(core[0]>150&&core[2]>150&&Math.abs(core[0]-core[2])>60)||(core[2]>150&&core[0]<150&&Math.abs(core[1]-core[2])<80&&core[1]>120);
    const ringUp=Math.abs(up[1]-up[2])<30&&up[1]>25;  // 盤地より少し明るいリング帯
    if (sat && ringUp) out.push({cx,cy,X:rect.left+ex,Y:rect.top+ey});
  }
  return JSON.stringify(out);
})()"""

FRAME_PROF = r"""(() => {
  const c=document.getElementById('board'), x=c.getContext('2d');
  const t=x.getTransform(), d=t.a, W=c.width/d;
  const px=(lx,ly)=>{const p=x.getImageData(Math.round(lx*d),Math.round(ly*d),1,1).data;return [p[0],p[1],p[2]];};
  // 列1中央(cx=1.5cell)を上端から内側16px
  const A=[...Array(16)].map((_,y)=>px(W*0.1875, y+0.4));
  // 左端を内側へ16px(行2.75)
  const B=[...Array(16)].map((_,xx)=>px(xx+0.4, W*0.34));
  return JSON.stringify({A,B});
})()"""

async def main():
    global ws
    async with websockets.connect(ws_url, max_size=60_000_000) as ws:
        await send("Page.enable")
        await send("Network.setBypassServiceWorker", bypass=True)
        await send("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)

        for glow, tag in ((0, "noglow"), (40, "glow40")):
            await js(f"localStorage.setItem('otv2:prefs', JSON.stringify({{pace:'jitter',sound:true,turnGlow:{glow},turnWidth:2}}))")
            await send("Page.navigate", url=f"http://127.0.0.1:4321/?probe_{tag}=" + str(time.time()))
            await asyncio.sleep(2.5)
            await js("document.getElementById('btn-local').click()")   # 2人対戦=自由交互
            await asyncio.sleep(1.0)
            # 端マス優先で10手
            for step in range(10):
                dots = json.loads(await js(DOTS))
                if not dots: print(f"[{tag}] no dots at", step); break
                edge = [p for p in dots if p["cx"] in (0, 7) or p["cy"] in (0, 7)]
                pick = (edge or dots)[0]
                await js(f"document.getElementById('board').dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true,clientX:{pick['X']},clientY:{pick['Y']},pointerId:9}}))")
                await asyncio.sleep(0.7)
            stones = json.loads(await js(PROBE))
            print(f"[{tag}] stones:", [(s[0], s[1]) for s in stones])
            prof = json.loads(await js(FRAME_PROF))
            print(f"[{tag}] top-band(px0-15):", prof["A"])
            print(f"[{tag}] left-band(px0-15):", prof["B"])
            geo = json.loads(await js("""JSON.stringify((()=>{const r=document.getElementById('board').getBoundingClientRect();return{x:r.left,y:r.top,w:r.width}})())"""))
            await shot(f"probe_{tag}", {"x": geo["x"] - 3, "y": geo["y"] - 3, "width": geo["w"] + 6, "height": geo["w"] + 6})

asyncio.run(main())
