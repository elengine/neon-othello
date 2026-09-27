import asyncio, json, urllib.request
import websockets
ws_url = next(t["webSocketDebuggerUrl"] for t in
    json.load(urllib.request.urlopen("http://127.0.0.1:9333/json")) if t.get("type")=="page")
_id=0
async def send(m,**p):
    global _id; _id+=1
    await ws.send(json.dumps({"id":_id,"method":m,"params":p}))
    while True:
        r=json.loads(await ws.recv())
        if r.get("id")==_id: return r.get("result",{})
async def js(e):
    r=await send("Runtime.evaluate",expression=e,returnByValue=True)
    return r.get("result",{}).get("value")
async def main():
    global ws
    async with websockets.connect(ws_url,max_size=60_000_000) as ws:
        print("my-turn:", await js("document.getElementById('screen-game').classList.contains('my-turn')"))
        print("game active:", await js("document.getElementById('screen-game').classList.contains('active')"))
        print("vignette opacity:", await js("getComputedStyle(document.getElementById('turn-vignette')).opacity"))
        # 一時停止→相手番を跨ぐ代わりに、直接クラスを消してtransition確認
        await js("document.getElementById('screen-game').classList.remove('my-turn')")
        await asyncio.sleep(0.6)
        print("after removal opacity:", await js("getComputedStyle(document.getElementById('turn-vignette')).opacity"))
asyncio.run(main())
