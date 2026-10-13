import asyncio
import json
import os
import random
import time
import urllib.request
from aiohttp import web, WSMsgType

PORT = int(os.environ.get("PORT", 8080))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MultiplayerRoom:
    def __init__(self):
        self.players = {} # ws -> player_dict
        self.round_id = int(time.time()) % 100000
        self.phase = "betting" # "betting", "shaking", "squeezing", "revealed"
        self.time_left = 20
        self.dice = [1, 2, 3]
        self.current_round_data = None
        self.history = []
        self.chat_messages = []

        self.table_bets = {
            "tai": 0, "xiu": 0, "chan": 0, "le": 0, "bao": 0,
            "points": {str(i): 0 for i in range(4, 18)}
        }

        self.multipliers = {
            "tai": 1, "xiu": 1, "chan": 1, "le": 1, "bao": 30,
            "points": {
                "4": 60, "17": 60, "5": 30, "16": 30,
                "6": 18, "15": 18, "7": 12, "14": 12,
                "8": 8, "13": 8, "9": 6, "10": 6,
                "11": 6, "12": 6
            }
        }

    def reset_bets(self):
        self.table_bets = {
            "tai": 0, "xiu": 0, "chan": 0, "le": 0, "bao": 0,
            "points": {str(i): 0 for i in range(4, 18)}
        }
        for p in self.players.values():
            p["bets"] = {
                "tai": 0, "xiu": 0, "chan": 0, "le": 0, "bao": 0,
                "points": {str(i): 0 for i in range(4, 18)}
            }

    def get_public_state(self):
        return {
            "round_id": self.round_id,
            "phase": self.phase,
            "time_left": self.time_left,
            "dice": self.dice,
            "table_bets": self.table_bets,
            "current_round_data": self.current_round_data,
            "player_count": len(self.players),
            "players": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "avatar": p["avatar"],
                    "balance": p["balance"],
                    "total_bet": (p["bets"]["tai"] + p["bets"]["xiu"] + p["bets"]["chan"] + p["bets"]["le"] + p["bets"]["bao"] + sum(p["bets"]["points"].values()))
                }
                for p in self.players.values()
            ]
        }

    async def broadcast(self, message_dict):
        if not self.players:
            return
        payload = json.dumps(message_dict, ensure_ascii=False)
        tasks = []
        for ws in list(self.players.keys()):
            if not ws.closed:
                tasks.append(ws.send_str(payload))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def fetch_drand_dice(self):
        try:
            req = urllib.request.Request(
                "https://api.drand.sh/public/latest",
                headers={"User-Agent": "TaiXiuMultiplayer/1.0"}
            )
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode())
                hex_str = data["randomness"]
                c1 = hex_str[0:8]
                c2 = hex_str[8:16]
                c3 = hex_str[16:24]
                v1 = int(c1, 16)
                v2 = int(c2, 16)
                v3 = int(c3, 16)
                d1 = (v1 % 6) + 1
                d2 = (v2 % 6) + 1
                d3 = (v3 % 6) + 1
                return {
                    "source": "League of Entropy (Drand Cloudflare)",
                    "round": data["round"],
                    "randomnessHex": hex_str,
                    "signature": data.get("signature", ""),
                    "dice": [d1, d2, d3],
                    "isLiveWeb": True,
                    "seeds": [
                        {"chunk": c1, "int": v1, "dice": d1, "formula": f"({v1} % 6) + 1 = {d1}"},
                        {"chunk": c2, "int": v2, "dice": d2, "formula": f"({v2} % 6) + 1 = {d2}"},
                        {"chunk": c3, "int": v3, "dice": d3, "formula": f"({v3} % 6) + 1 = {d3}"}
                    ]
                }
        except Exception:
            c1 = os.urandom(4).hex()
            c2 = os.urandom(4).hex()
            c3 = os.urandom(4).hex()
            v1 = int(c1, 16)
            v2 = int(c2, 16)
            v3 = int(c3, 16)
            d1 = (v1 % 6) + 1
            d2 = (v2 % 6) + 1
            d3 = (v3 % 6) + 1
            return {
                "source": "CSPRNG Secure Fallback",
                "round": f"Local-{int(time.time()) % 100000}",
                "randomnessHex": c1 + c2 + c3,
                "signature": "N/A (CSPRNG Server)",
                "dice": [d1, d2, d3],
                "isLiveWeb": False,
                "seeds": [
                    {"chunk": c1, "int": v1, "dice": d1, "formula": f"({v1} % 6) + 1 = {d1}"},
                    {"chunk": c2, "int": v2, "dice": d2, "formula": f"({v2} % 6) + 1 = {d2}"},
                    {"chunk": c3, "int": v3, "dice": d3, "formula": f"({v3} % 6) + 1 = {d3}"}
                ]
            }

room = MultiplayerRoom()

async def game_loop():
    while True:
        # Phase 1: BETTING (20s)
        room.phase = "betting"
        room.round_id += 1
        room.reset_bets()
        room.time_left = 20

        await room.broadcast({
            "type": "phase_change",
            "phase": "betting",
            "round_id": room.round_id,
            "time_left": room.time_left,
            "table_bets": room.table_bets
        })

        while room.time_left > 0:
            await asyncio.sleep(1)
            room.time_left -= 1
            await room.broadcast({
                "type": "tick",
                "time_left": room.time_left
            })

        # Phase 2: SHAKING (3s)
        room.phase = "shaking"
        await room.broadcast({
            "type": "phase_change",
            "phase": "shaking",
            "time_left": 3
        })

        round_data = await asyncio.to_thread(room.fetch_drand_dice)
        room.current_round_data = round_data
        room.dice = round_data["dice"]
        await asyncio.sleep(3)

        # Phase 3: SQUEEZING (10s)
        room.phase = "squeezing"
        room.time_left = 10
        await room.broadcast({
            "type": "phase_change",
            "phase": "squeezing",
            "time_left": room.time_left,
            "current_round_data": room.current_round_data,
            "dice": room.dice
        })

        while room.time_left > 0:
            await asyncio.sleep(1)
            room.time_left -= 1
            await room.broadcast({
                "type": "tick",
                "time_left": room.time_left
            })

        # Phase 4: REVEAL (6s)
        room.phase = "revealed"
        d1, d2, d3 = room.dice
        total = d1 + d2 + d3
        is_bao = (d1 == d2 == d3)
        is_tai = (not is_bao) and (11 <= total <= 17)
        is_xiu = (not is_bao) and (4 <= total <= 10)
        is_chan = (total % 2 == 0)
        is_le = (total % 2 != 0)
        outcome = "BAO" if is_bao else ("TAI" if is_tai else "XIU")

        player_payouts = []
        for ws, p in room.players.items():
            user_bets = p["bets"]
            win_amount = 0

            if is_tai and user_bets["tai"] > 0:
                win_amount += user_bets["tai"] * 2
            if is_xiu and user_bets["xiu"] > 0:
                win_amount += user_bets["xiu"] * 2

            if not is_bao:
                if is_chan and user_bets["chan"] > 0:
                    win_amount += user_bets["chan"] * 2
                if is_le and user_bets["le"] > 0:
                    win_amount += user_bets["le"] * 2

            if is_bao and user_bets["bao"] > 0:
                win_amount += user_bets["bao"] * 31

            pt_str = str(total)
            if user_bets["points"].get(pt_str, 0) > 0:
                mult = room.multipliers["points"].get(pt_str, 0)
                win_amount += user_bets["points"][pt_str] * (mult + 1)

            if win_amount > 0:
                p["balance"] += win_amount

            player_payouts.append({
                "id": p["id"],
                "name": p["name"],
                "win": win_amount,
                "balance": p["balance"]
            })

        history_item = {
            "round": room.round_id,
            "dice": room.dice,
            "total": total,
            "outcome": outcome,
            "source": room.current_round_data["source"],
            "randomnessHex": room.current_round_data["randomnessHex"],
            "timestamp": time.strftime("%H:%M:%S")
        }
        room.history.insert(0, history_item)
        if len(room.history) > 100:
            room.history.pop()

        await room.broadcast({
            "type": "reveal_result",
            "round_id": room.round_id,
            "dice": room.dice,
            "total": total,
            "outcome": outcome,
            "is_chan": is_chan,
            "is_le": is_le,
            "is_bao": is_bao,
            "player_payouts": player_payouts,
            "history_item": history_item
        })

        await asyncio.sleep(6)

async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=20.0)
    await ws.prepare(request)

    player_id = f"p_{int(time.time() * 1000) % 100000}_{random.randint(100, 999)}"
    player_data = {
        "id": player_id,
        "name": f"Người Chơi {random.randint(10, 99)}",
        "avatar": random.choice(["🐯", "🦁", "🐉", "🦅", "🐼", "🦊", "👑", "💎"]),
        "balance": 50000,
        "bets": {
            "tai": 0, "xiu": 0, "chan": 0, "le": 0, "bao": 0,
            "points": {str(i): 0 for i in range(4, 18)}
        }
    }
    room.players[ws] = player_data

    # Send initial welcome packet
    welcome_payload = {
        "type": "welcome",
        "your_id": player_id,
        "player_data": player_data,
        "room_state": room.get_public_state(),
        "history": room.history[:60],
        "chat_messages": room.chat_messages[-25:]
    }
    await ws.send_str(json.dumps(welcome_payload, ensure_ascii=False))

    await room.broadcast({
        "type": "player_joined",
        "player": {
            "id": player_data["id"],
            "name": player_data["name"],
            "avatar": player_data["avatar"],
            "balance": player_data["balance"]
        },
        "player_count": len(room.players)
    })

    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                data = json.loads(msg.data)
                msg_type = data.get("type")

                if msg_type == "update_profile":
                    if "name" in data and data["name"].strip():
                        player_data["name"] = data["name"].strip()[:18]
                    if "avatar" in data:
                        player_data["avatar"] = data["avatar"]
                    if "balance" in data and isinstance(data["balance"], int) and data["balance"] > 0:
                        player_data["balance"] = data["balance"]
                    await room.broadcast({
                        "type": "player_updated",
                        "player": player_data
                    })

                elif msg_type == "place_bet":
                    if room.phase != "betting":
                        continue
                    bet_type = data.get("bet_type")
                    amount = int(data.get("amount", 0))

                    if amount > 0 and player_data["balance"] >= amount:
                        player_data["balance"] -= amount
                        if bet_type in ["tai", "xiu", "chan", "le", "bao"]:
                            player_data["bets"][bet_type] += amount
                            room.table_bets[bet_type] += amount
                        elif bet_type in room.table_bets["points"]:
                            player_data["bets"]["points"][bet_type] += amount
                            room.table_bets["points"][bet_type] += amount

                        await room.broadcast({
                            "type": "bet_placed",
                            "player_id": player_id,
                            "player_name": player_data["name"],
                            "avatar": player_data["avatar"],
                            "bet_type": bet_type,
                            "amount": amount,
                            "player_balance": player_data["balance"],
                            "table_bets": room.table_bets
                        })

                elif msg_type == "clear_bets":
                    if room.phase != "betting":
                        continue
                    refund = 0
                    for k in ["tai", "xiu", "chan", "le", "bao"]:
                        refund += player_data["bets"][k]
                        room.table_bets[k] -= player_data["bets"][k]
                        player_data["bets"][k] = 0
                    for k in room.table_bets["points"]:
                        refund += player_data["bets"]["points"][k]
                        room.table_bets["points"][k] -= player_data["bets"]["points"][k]
                        player_data["bets"]["points"][k] = 0

                    player_data["balance"] += refund
                    await ws.send_str(json.dumps({
                        "type": "bets_cleared",
                        "balance": player_data["balance"],
                        "table_bets": room.table_bets
                    }))
                    await room.broadcast({
                        "type": "table_bets_updated",
                        "table_bets": room.table_bets
                    })

                elif msg_type == "refill":
                    player_data["balance"] += 10000
                    await ws.send_str(json.dumps({
                        "type": "refill_success",
                        "balance": player_data["balance"]
                    }))
                    await room.broadcast({
                        "type": "player_updated",
                        "player": player_data
                    })

                elif msg_type == "chat":
                    text = str(data.get("text", "")).strip()[:100]
                    if text:
                        chat_msg = {
                            "id": player_id,
                            "name": player_data["name"],
                            "avatar": player_data["avatar"],
                            "text": text,
                            "time": time.strftime("%H:%M")
                        }
                        room.chat_messages.append(chat_msg)
                        if len(room.chat_messages) > 40:
                            room.chat_messages.pop(0)
                        await room.broadcast({
                            "type": "new_chat",
                            "message": chat_msg
                        })

                elif msg_type == "squeeze_move":
                    if room.phase == "squeezing":
                        dx = data.get("dx", 0)
                        dy = data.get("dy", 0)
                        await room.broadcast({
                            "type": "squeeze_motion",
                            "squeezer": player_data["name"],
                            "dx": dx,
                            "dy": dy
                        })

            elif msg.type == WSMsgType.ERROR:
                pass
    finally:
        if ws in room.players:
            del room.players[ws]
            await room.broadcast({
                "type": "player_left",
                "player_id": player_id,
                "player_name": player_data["name"],
                "player_count": len(room.players)
            })

    return ws

async def start_background_tasks(app):
    app['game_task'] = asyncio.create_task(game_loop())

async def cleanup_background_tasks(app):
    app['game_task'].cancel()
    await app['game_task']

def create_app():
    app = web.Application()
    app.on_startup.append(start_background_tasks)
    app.on_cleanup.append(cleanup_background_tasks)

    # Routes
    app.router.add_get('/ws', ws_handler)
    async def index_file(request):
        return web.FileResponse(os.path.join(DIRECTORY, 'index.html'))
    app.router.add_get('/', index_file)
    # Serve static directory
    app.router.add_static('/', DIRECTORY, show_index=False)
    return app

if __name__ == "__main__":
    app = create_app()
    print(f"==================================================")
    print(f"🎲 WEB TÀI XỈU MULTIPLAYER CLOUD READY")
    print(f"📍 Chạy cổng: {PORT} (HTTP & WebSocket /ws trên cùng cổng)")
    print(f"==================================================")
    web.run_app(app, host="0.0.0.0", port=PORT)
