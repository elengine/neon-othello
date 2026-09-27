import asyncio, json, base64, time, sys, urllib.request
import websockets

PORT = "9333"
ws_url = next(t["webSocketDebuggerUrl"] for t in
    json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")) if t.get("type")=="page")
_id = 0; ws = None

async def send(method, **params):
    global _id; _id += 1
    await ws.send(json.dumps({"id": _id, "method": method, "params": params}))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("id") == _id:
            if "error" in msg: raise RuntimeError(f"{method}: {msg['error']}")
            return msg["result"]

async def js(expr):
    r = await send("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
    return r.get("result", {}).get("value")

async def shot(name):
    data = (await send("Page.captureScreenshot", format="png"))["data"]
    path = f"/opt/data/{name}.png"
    open(path, "wb").write(base64.b64decode(data))
    print("shot:", path)

async def main():
    global ws
    async with websockets.connect(ws_url, max_size=60_000_000) as ws:
        await send("Page.enable")
        await send("Network.enable")
        await send("Network.setBypassServiceWorker", bypass=True)
        await send("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
        await send("Page.navigate", url="http://127.0.0.1:4321/?cb=" + str(time.time()))
        await asyncio.sleep(2.5)
        await js("document.getElementById('btn-ai').click()")
        await asyncio.sleep(0.6)
        await js("document.querySelector('[data-level=\"1\"]').click()")
        await asyncio.sleep(1.2)
        print("ripple element gone:", await js("document.getElementById('turn-ripple')===null"))
        print("my-turn:", await js("document.getElementById('screen-game').classList.contains('my-turn')"))
        print("vignette opacity:", await js("getComputedStyle(document.getElementById('turn-vignette')).opacity"))
        await shot("v13_myturn")
        await asyncio.sleep(1.0)
        await js("""(() => {
          const stage = document.getElementById('board-stage');
          const r = stage.getBoundingClientRect();
          const cell = r.width / 8;
          const c = document.getElementById('board');
          for (const [cx,cy] of [[3,5],[4,2],[2,3],[5,6],[6,1],[1,1]]) {
            const x = r.left + cell*(cx+0.5), y = r.top + cell*(cy+0.5);
            c.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:x, clientY:y, pointerId:7}));
          }
          return true;
        })()""")
        await asyncio.sleep(2.0)
        print("opp-turn vignette opacity:", await js("getComputedStyle(document.getElementById('turn-vignette')).opacity"))
        await shot("v13_oppturn")

asyncio.run(main())
