import { WebSocket, WebSocketServer } from 'ws';
import { PROTOCOL_VERSION } from 'yeouido-net';

import http from 'http';

import { rtcAvailable } from './rtc';
import { World } from './world';

/**
 * 여의도 3D 게임 서버.
 * - GET /        상태 확인 (JSON)
 * - WS  /ws      게임 접속
 * 개발: npx nx serve yeouido-game-server (기본 3200)
 */
const PORT = Number(process.env.PORT) || 3200;

const world = new World('yeouido');
world.start();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ ok: true, world: world.id, players: world.size, protocol: PROTOCOL_VERSION, tickMs: Math.round(world.lastTickMs * 100) / 100, rtc: rtcAvailable() }));
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws:WebSocket) => world.connect(ws));

// 끊긴 줄 모르는 연결 정리 (30초마다 ping, 응답 없으면 끊음)
const alive = new WeakMap<WebSocket, boolean>();
wss.on('connection', (ws:WebSocket) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
});
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!alive.get(ws)) {
      ws.terminate();
      return;
    }
    alive.set(ws, false);
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => console.log(`yeouido-game-server :${PORT} (ws /ws)`));