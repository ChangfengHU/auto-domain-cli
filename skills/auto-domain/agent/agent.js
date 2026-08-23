#!/usr/bin/env node
/**
 * auto-domain Agent
 * Usage: node agent.js --port=3000 [--name=myapp] [--auto-name]
 *                      [--server=wss://tunnel-api.chxyka.ccwu.cc]
 *                      [--tg-token=BOT_TOKEN] [--tg-chat=CHAT_ID]
 */

const WebSocket = require('ws');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.length ? v.join('=') : true];
    })
);

const PORT      = parseInt(args.port || args.p || '3000', 10);
const TOKEN     = args.token  || args.t || '';
const NAME      = args.name   || args.n || '';
const METADATA  = args.metadata || args.m || '';
const AUTO_NAME = args['auto-name'] === true || args['auto-name'] === '1' || args.auto === true || args.auto === '1';
const REPLACE   = args['replace'] === true || args['replace'] === '1';
const SERVER    = (args.server || 'wss://tunnel-api.chxyka.ccwu.cc').replace(/\/$/, '');
const TG_TOKEN  = args['tg-token'] || process.env.TG_BOT_TOKEN  || '';
const TG_CHAT   = args['tg-chat']  || process.env.TG_CHAT_ID    || '';
const LOCAL_HOST = process.env.AUTO_DOMAIN_LOCAL_HOST || '127.0.0.1';
// 转发给本地服务时用哪个 Host。默认(空)沿用 fetch 由 URL 推出的回环 Host,
// 因为多数本地服务拿 Host 做 DNS-rebinding 防护、只认回环地址。
// 但有的服务(如 dsh)规定「Origin 存在时必须等于 Host」:浏览器会带公网 Origin,
// 而本地 Host 是回环,于是**所有浏览器请求 403**。这类服务自己用 --trusted-host
// 声明了受信公网主机名,填进本变量即可,两道防护(rebinding / 跨站)都还在。
// 两个坑:①上游隧道服务端会剥掉 Host 头,agent 收到的是 undefined,只能显式给;
// ②undici 的 fetch 把 Host 当禁止头丢弃,所以设了这个变量必须绕开 fetch 走 node:http。
const FORWARD_HOST = process.env.AUTO_DOMAIN_FORWARD_HOST || '';
const LOCAL_HEALTH_PATH = (process.env.AUTO_DOMAIN_LOCAL_HEALTH_PATH || '/').trim() || '/';

const PING_INTERVAL_MS       = 30_000;               // 30s 应用层心跳
const PONG_TIMEOUT_MS        = 15_000;               // 15s 未收到 pong，主动断开重连
const LOCAL_CHECK_INTERVAL_MS = 30_000;              // 30s 本地健康检查
const SELF_DESTRUCT_MS        = 24 * 60 * 60 * 1000; // 24h 无连接自毁

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTg(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' }),
    });
  } catch (_) {}
}

function tgMsg(emoji, title, fields) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const lines = [`${emoji} <b>${title}</b>`];
  for (const [k, v] of Object.entries(fields)) {
    lines.push(`   ${k}: <code>${v}</code>`);
  }
  lines.push(`   Time: ${now}`);
  return lines.join('\n');
}

// ── State ─────────────────────────────────────────────────────────────────────

let reconnectDelay = 3000;
let localCheckTimer = null;
let tunnelUrl      = '';
let subdomain      = '';
let connectTime    = null;
let reconnectCount = 0;
let sleeping       = false;
let localOk        = null;   // null=unknown, true=ok, false=down
let failingSince   = null;   // timestamp: when did continuous failure start
let replacing      = false;  // true while --replace eviction is in progress

// ── Helpers ───────────────────────────────────────────────────────────────────

let cachedIPv4 = '';
async function getPublicIPv4() {
  if (cachedIPv4) return cachedIPv4;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch('https://ipv4.icanhazip.com', { signal: ctrl.signal });
    clearTimeout(t);
    cachedIPv4 = (await resp.text()).trim();
    return cachedIPv4;
  } catch {
    return '';
  }
}

function currentSubdomain() {
  return NAME || (tunnelUrl ? tunnelUrl.split('//')[1].split('.')[0] : '?');
}

function stopLocalCheck() {
  if (localCheckTimer) { clearInterval(localCheckTimer); localCheckTimer = null; }
}

function createHeartbeatController({
  pingIntervalMs = PING_INTERVAL_MS,
  pongTimeoutMs = PONG_TIMEOUT_MS,
  getLocalOk = () => localOk,
  logger = console,
  WebSocketImpl = WebSocket,
} = {}) {
  let pingTimer = null;
  let pongTimer = null;
  let activeSocket = null;
  let queuedSend = false;

  function clearPongDeadline() {
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
  }

  function stop() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    clearPongDeadline();
    activeSocket = null;
    queuedSend = false;
  }

  function terminateStaleSocket(ws, reason) {
    clearPongDeadline();
    logger.error(`[auto-domain] ${reason}; terminating stale WebSocket.`);
    try { ws.terminate(); } catch (_) {}
  }

  function send(ws) {
    if (!ws || ws.readyState !== WebSocketImpl.OPEN) return;
    activeSocket = ws;
    if (pongTimer) {
      queuedSend = true;
      return;
    }

    pongTimer = setTimeout(() => {
      pongTimer = null;
      if (ws.readyState === WebSocketImpl.OPEN) {
        terminateStaleSocket(ws, `Pong timeout after ${pongTimeoutMs}ms`);
      }
    }, pongTimeoutMs);

    try {
      ws.send(JSON.stringify({ type: 'ping', local_ok: getLocalOk() !== false }));
    } catch (error) {
      terminateStaleSocket(ws, `Heartbeat send failed: ${error.message}`);
    }
  }

  function start(ws) {
    stop();
    activeSocket = ws;
    send(ws);
    pingTimer = setInterval(() => send(ws), pingIntervalMs);
  }

  function acknowledge() {
    clearPongDeadline();
    if (queuedSend && activeSocket) {
      queuedSend = false;
      send(activeSocket);
    }
  }

  return { start, stop, send, acknowledge };
}

const heartbeat = createHeartbeatController();

async function checkLocalService() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const healthPath = LOCAL_HEALTH_PATH.startsWith('/') ? LOCAL_HEALTH_PATH : `/${LOCAL_HEALTH_PATH}`;
    await fetch(`http://${LOCAL_HOST}:${PORT}${healthPath}`, { signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

async function doLocalCheck(ws) {
  const ok = await checkLocalService();
  if (ok === localOk) return; // 无变化，不处理
  const prev = localOk;
  localOk = ok;
  // 首次结果也要同步给服务端；若初始 heartbeat 仍在等待 pong，
  // controller 会在该 pong 到达后立即补发最新 local_ok。
  if (ws && ws.readyState === WebSocket.OPEN) {
    heartbeat.send(ws);
  }
  if (prev === null) return; // 首次检查不发通知
  if (ok) {
    console.log('[auto-domain] ✅ Local service recovered on port', PORT);
    sendTg(tgMsg('🟢', 'Local Service Recovered', {
      Port: String(PORT), Subdomain: currentSubdomain(),
    })).catch(() => {});
  } else {
    console.log('[auto-domain] ❌ Local service DOWN on port', PORT);
    sendTg(tgMsg('🔴', 'Local Service Down', {
      Port: String(PORT), Subdomain: currentSubdomain(),
    })).catch(() => {});
  }
}

function startLocalCheck(ws) {
  stopLocalCheck();
  doLocalCheck(ws); // 立即跑一次
  localCheckTimer = setInterval(() => doLocalCheck(ws), LOCAL_CHECK_INTERVAL_MS);
}

async function buildWsUrl() {
  const base = SERVER.replace(/^http/, 'ws');
  const u    = new URL(base);
  if (TOKEN) u.searchParams.set('token', TOKEN);
  u.searchParams.set('port', String(PORT));
  if (NAME) u.searchParams.set('name', NAME);
  if (AUTO_NAME) u.searchParams.set('auto', '1');
  if (METADATA) u.searchParams.set('metadata', METADATA);
  if (REPLACE) u.searchParams.set('replace', '1');
  const ip = await getPublicIPv4();
  if (ip) u.searchParams.set('client_ip', ip);
  return u.toString();
}

// ── Connect ───────────────────────────────────────────────────────────────────

async function connect() {
  // 自毁检查：超过 24h 没有成功连接则退出
  if (failingSince && Date.now() - failingSince > SELF_DESTRUCT_MS) {
    console.error('[auto-domain] 24h without successful connection. Self-destructing.');
    sendTg(tgMsg('💀', 'Agent Self-Destruct', {
      Name: NAME || '(auto)',
      Reason: '24h no connection to server',
    })).finally(() => process.exit(1));
    return;
  }

  if (!failingSince) failingSince = Date.now();

  console.log('[auto-domain] Connecting...');
  const ws = new WebSocket(await buildWsUrl());

  ws.on('open', () => {
    reconnectDelay = 3000;
    console.log('[auto-domain] Connected. Waiting for assignment...');
  });

  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // ── 隧道建立 ──────────────────────────────────────────────────────────────
    if (msg.type === 'connected') {
      failingSince = null; // 成功连上，重置失败计时器
      tunnelUrl    = msg.url;
      subdomain    = msg.subdomain || currentSubdomain();
      connectTime  = Date.now();
      sleeping     = false;
      const isReconnect = reconnectCount > 0;
      reconnectCount++;

      console.log(`\n✅ Tunnel is live!`);
      console.log(`   Public URL : ${msg.url}`);
      console.log(`   Forwarding : ${msg.url} → http://${LOCAL_HOST}:${PORT}\n`);

      heartbeat.start(ws);
      startLocalCheck(ws);

      await sendTg(tgMsg(
        isReconnect ? '🔄' : '🟢',
        isReconnect ? 'Tunnel Reconnected' : 'Tunnel Online',
        {
          Subdomain: subdomain,
          URL: msg.url,
          Forwarding: `→ http://${LOCAL_HOST}:${PORT}`,
          ...(isReconnect ? { 'Reconnect #': String(reconnectCount - 1) } : {}),
        }
      ));
      return;
    }

    if (msg.type === 'pong') {
      heartbeat.acknowledge();
      return;
    }

    // ── 服务端命令 ─────────────────────────────────────────────────────────────
    if (msg.type === 'sleep') {
      sleeping = true;
      console.log('[auto-domain] 💤 Sleep command received — pausing request forwarding.');
      ws.send(JSON.stringify({ type: 'sleep_ack' }));
      return;
    }

    if (msg.type === 'wake') {
      sleeping = false;
      console.log('[auto-domain] ☀️  Wake command received — resuming request forwarding.');
      ws.send(JSON.stringify({ type: 'wake_ack' }));
      return;
    }

    if (msg.type === 'kill') {
      console.log('[auto-domain] 💀 Kill command received. Exiting gracefully.');
      await sendTg(tgMsg('💀', 'Agent Killed by Server', {
        Subdomain: currentSubdomain(),
      }));
      ws.close(1000, 'Server kill command');
      process.exit(0);
    }

    // ── 代理请求 ───────────────────────────────────────────────────────────────
    if (msg.type === 'request') {
      if (sleeping) {
        ws.send(JSON.stringify({
          type: 'response', id: msg.id, status: 503,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify({ error: 'Agent sleeping' })).toString('base64'),
        }));
        return;
      }
      handleRequest(ws, msg);
    }
  });

  ws.on('close', async (code) => {
    heartbeat.stop();
    stopLocalCheck();
    localOk = null;

    // 4002 = admin reset (删除按钮触发) → 退出，不重连
    if (code === 4002) {
      console.error('[auto-domain] Tunnel deleted by admin. Exiting.');
      process.exit(0);
    }

    // --replace eviction is already handling the reconnect; skip duplicate
    if (replacing) {
      replacing = false;
      return;
    }

    const downAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    console.log(`[auto-domain] Disconnected (${code}). Reconnecting in ${reconnectDelay / 1000}s...`);

    if (tunnelUrl) {
      await sendTg(tgMsg('🔴', 'Tunnel Disconnected', {
        Subdomain: currentSubdomain(),
        'Close code': String(code),
        'Next retry': `${reconnectDelay / 1000}s`,
        'Disconnected at': downAt,
      }));
    }

    if (!failingSince) failingSince = Date.now();
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });

  ws.on('error', async (err) => {
    console.error(`[auto-domain] Error: ${err.message}`);

    if (err.message.includes('409') || err.message.toLowerCase().includes('name already in use')) {
      if (REPLACE && NAME) {
        replacing = true;  // prevent close handler from scheduling a second reconnect
        console.log(`[auto-domain] 409 detected — --replace mode: evicting old agent for '${NAME}'...`);
        try {
          const apiBase = SERVER.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
          await fetch(`${apiBase}/admin/tunnels/${encodeURIComponent(NAME)}`, { method: 'DELETE' });
        } catch (_) {}
        await new Promise(r => setTimeout(r, 2000));
        console.log('[auto-domain] Retrying connection...');
        connect();
        return;
      }
      console.error(`\nError: subdomain '${NAME}' is already in use by another agent.`);
      console.error('   Use a different --name, or pass --auto-name to get a random suffix.');
      console.error('   Or pass --replace to automatically evict the existing agent.');
      await sendTg(tgMsg('🚫', 'Name Conflict', {
        Name: NAME,
        Action: 'Use --replace to evict, or choose a different --name',
      }));
      process.exit(2);
    }

    if (err.message.includes('401') || err.message.includes('Unauthorized')) {
      await sendTg(tgMsg('🚨', 'Agent Auth Failed', {
        Error: err.message,
        Action: 'Check --token value',
      }));
    }
  });
}

// 只在需要自定义 Host 时使用:fetch 会丢弃 Host,node:http 不会。
function forwardWithHost(path, method, headers, body) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const req = http.request({ host: LOCAL_HOST, port: PORT, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])),
        buffer: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Handle proxy request ──────────────────────────────────────────────────────

async function handleRequest(ws, msg) {
  const localUrl = `http://${LOCAL_HOST}:${PORT}${msg.path}`;
  try {
    const hasBody = msg.body && !['GET', 'HEAD'].includes(msg.method.toUpperCase());
    const body    = hasBody ? Buffer.from(msg.body, 'base64') : undefined;
    const headers = { ...msg.headers };
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (['host', 'connection', 'upgrade', 'keep-alive', 'proxy-authenticate',
        'proxy-authorization', 'te', 'trailer', 'transfer-encoding',
        'content-length'].includes(lower)) {
        delete headers[key];
      }
    }
    let status, respBuffer, respHeaders;
    if (FORWARD_HOST) {
      headers['host'] = FORWARD_HOST;
      const r = await forwardWithHost(msg.path, msg.method, headers, body);
      status = r.status; respBuffer = r.buffer; respHeaders = r.headers;
    } else {
      headers['host'] = `${LOCAL_HOST}:${PORT}`;
      const resp = await fetch(localUrl, { method: msg.method, headers, body, redirect: 'manual' });
      status = resp.status;
      respBuffer = Buffer.from(await resp.arrayBuffer());
      respHeaders = {};
      resp.headers.forEach((v, k) => { respHeaders[k] = v; });
    }

    ws.send(JSON.stringify({
      type: 'response', id: msg.id,
      status,
      headers: respHeaders,
      body: respBuffer.toString('base64'),
    }));
  } catch (err) {
    console.error(`[auto-domain] Local request failed: ${msg.method} ${msg.path}: ${err.message}`);
    ws.send(JSON.stringify({
      type: 'response', id: msg.id, status: 502,
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from(`Local service error: ${err.message}`).toString('base64'),
    }));
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

function startAgent() {
  return sendTg(tgMsg('▶️', 'Agent Starting', {
    Name: NAME || '(auto)',
    Port: String(PORT),
    Server: SERVER,
  })).then(() => connect());
}

if (require.main === module) {
  startAgent();
}

module.exports = { createHeartbeatController, startAgent };
