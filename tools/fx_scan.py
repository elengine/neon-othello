import asyncio, json, time, urllib.request
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
    return r.get("result", {}).get("value")

SCAN = r"""(() => {
  const c = document.getElementById('board');
  const g = c.getContext('2d');
  // canvas は css (size+2*pad) / dpr*2。盤中央Yの横1列を走査: 明るい帯(枠)があるx範囲を検出
  const W = c.width;
  const midY = Math.floor(W / 2);
  const row = g.getImageData(0, midY, W, 1).data;
  const bright = [];
  for (let xx = 0; xx < W; xx++) {
    const i = xx * 4;
    const br = (row[i] + row[i+1] + row[i+2]) / 3;
    if (br > 60) bright.push(xx);
  }
  // 連続区間にまとめる
  const spans = [];
  let s = null;
  for (const b of bright) {
    if (s === null) { s = b; continue; }
    if (b - bright[bright.indexOf(b) - 1] > 2) { spans.push([s, prev]); s = b; }
    var prev = b;
  }
  if (s !== null) spans.push([s, prev]);
  // 盤本体(盤地 12,19,34)の範囲
  let boardStart = null, boardEnd = null;
  for (let xx = 0; xx < W; xx++) {
    const i = xx * 4;
    if (row[i] === 12 && row[i+1] === 19 && row[i+2] === 34) { if (boardStart === null) boardStart = xx; boardEnd = xx; }
  }
  return JSON.stringify({W, spans, boardStart, boardEnd, canvasCSS: c.style.width});
})()"""

async def main():
    global ws
    async with websockets.connect(ws_url, max_size=60_000_000) as ws:
        await send("Page.enable")
        await send("Network.setBypassServiceWorker", bypass=True)
        await send("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
        await send("Page.navigate", url="http://127.0.0.1:4321/?v20scan=" + str(time.time()))
        await asyncio.sleep(2.5)
        out = json.loads(await js(SCAN))
        print("W:", out["W"], "canvasCSS:", out["canvasCSS"])
        print("盤本体(盤地12,19,34) x範囲:", out["boardStart"], "-", out["boardEnd"])
        print("明るい帯(枠) spans:", out["spans"])
        # 判定: 盤本体の左端より左に帯がある=枠は盤外
        if out["spans"]:
            left_frame_end = min(sp[0] for sp in out["spans"] if sp[0] < out["boardStart"])
            print("OK: 枠帯の左側は盤本体より左 (frameEnd", left_frame_end, "< boardStart", out["boardStart"], ")")

asyncio.run(main())
