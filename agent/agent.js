#!/usr/bin/env node
/**
 * auto-domain Agent
 * Usage: node agent.js --token=TOKEN [--port=3000] [--name=myapp]
 *                      [--server=wss://tunnel-api.chxyka.ccwu.cc]
 *                      [--tg-token=BOT_TOKEN] [--tg-chat=CHAT_ID]
 */

const WebSocket = require('ws');

// ── Parse CLI args ────────────────────────────────────────────────────────────

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
const AUTO_NAME = args['auto-name'] === true || args['auto-name'] === '1' || args.auto === true || args.auto === '1';
const SERVER    = (args.server || 'wss://tunnel-api.chxyka.ccwu.cc').replace(/\/$/, '');
const TG_TOKEN  = args['tg-token'] || process.env.TG_BOT_TOKEN  || '';
const TG_CHAT   = args['tg-chat']  || process.env.TG_CHAT_ID    || '';
const PING_INTERVAL_MS = 30_000;

// TODO: re-enable token requirement when token validation is turned back on at the server.
// Token is currently optional and unvalidated.

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

// ── Connect ───────────────────────────────────────────────────────────────────

let reconnectDelay = 3000;
let pingTimer      = null;
let tunnelUrl      = '';
let connectTime    = null;
let reconnectCount = 0;

function buildWsUrl() {
  const base = SERVER.replace(/^http/, 'ws');
  const u    = new URL(base);
  if (TOKEN) u.searchParams.set('token', TOKEN);
  u.searchParams.set('port', String(PORT));
  if (NAME) u.searchParams.set('name', NAME);
  if (AUTO_NAME) u.searchParams.set('auto', '1');
  return u.toString();
}

function startPing(ws) {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, PING_INTERVAL_MS);
}

function stopPing() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
}

function connect() {
  console.log('[auto-domain] Connecting...');
  const ws = new WebSocket(buildWsUrl());

  ws.on('open', () => {
    reconnectDelay = 3000;
    console.log('[auto-domain] Connected. Waiting for assignment...');
  });

  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'connected') {
      tunnelUrl   = msg.url;
      connectTime = Date.now();
      const isReconnect = reconnectCount > 0;
      reconnectCount++;

      console.log(`\n✅ Tunnel is live!`);
      console.log(`   Public URL : ${msg.url}`);
      console.log(`   Forwarding : ${msg.url} → http://localhost:${PORT}\n`);
      startPing(ws);

      await sendTg(tgMsg(
        isReconnect ? '🔄' : '🟢',
        isReconnect ? 'Tunnel Reconnected' : 'Tunnel Online',
        {
          Subdomain: NAME || msg.url.split('//')[1].split('.')[0],
          URL: msg.url,
          Forwarding: `→ http://localhost:${PORT}`,
          ...(isReconnect ? { 'Reconnect #': String(reconnectCount - 1) } : {}),
        }
      ));
    }

    if (msg.type === 'pong') { /* heartbeat ok */ }

    if (msg.type === 'request') {
      handleRequest(ws, msg);
    }
  });

  ws.on('close', async (code) => {
    stopPing();
    const downAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    // 4002 = admin reset; exit gracefully so daemon doesn't spin reconnecting.
    if (code === 4002) {
      console.error('[auto-domain] Tunnel reset by admin. Exiting.');
      process.exit(0);
    }

    console.log(`[auto-domain] Disconnected (${code}). Reconnecting in ${reconnectDelay / 1000}s...`);

    if (tunnelUrl) {
      await sendTg(tgMsg('🔴', 'Tunnel Disconnected', {
        Subdomain: NAME || tunnelUrl.split('//')[1].split('.')[0],
        'Close code': String(code),
        'Next retry': `${reconnectDelay / 1000}s`,
        'Disconnected at': downAt,
      }));
    }

    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });

  ws.on('error', async (err) => {
    console.error(`[auto-domain] Error: ${err.message}`);
    // Server returned 409 → name already in use. Exit immediately, do NOT reconnect.
    if (err.message.includes('409') || err.message.toLowerCase().includes('name already in use')) {
      console.error('');
      console.error(`Error: subdomain '${NAME}' is already in use by another agent.`);
      console.error('   Use a different --name, or pass --auto-name to get a random suffix.');
      await sendTg(tgMsg('🚫', 'Name Conflict', {
        Name: NAME,
        Action: 'Use a different --name, or pass --auto-name',
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

// ── Handle proxy request ──────────────────────────────────────────────────────

async function handleRequest(ws, msg) {
  const localUrl = `http://localhost:${PORT}${msg.path}`;

  try {
    const hasBody = msg.body && !['GET', 'HEAD'].includes(msg.method.toUpperCase());
    const body    = hasBody ? Buffer.from(msg.body, 'base64') : undefined;

    const headers = { ...msg.headers };
    delete headers['host'];
    headers['host'] = `localhost:${PORT}`;

    const resp = await fetch(localUrl, { method: msg.method, headers, body, redirect: 'manual' });

    const respBuffer  = Buffer.from(await resp.arrayBuffer());
    const respHeaders = {};
    resp.headers.forEach((v, k) => { respHeaders[k] = v; });

    ws.send(JSON.stringify({
      type: 'response', id: msg.id,
      status: resp.status,
      headers: respHeaders,
      body: respBuffer.toString('base64'),
    }));
  } catch (err) {
    console.error(`[auto-domain] Local request failed: ${err.message}`);
    ws.send(JSON.stringify({
      type: 'response', id: msg.id, status: 502,
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from(`Local service error: ${err.message}`).toString('base64'),
    }));
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

sendTg(tgMsg('▶️', 'Agent Starting', {
  Name: NAME || '(auto)',
  Port: String(PORT),
  Server: SERVER,
})).then(() => connect());
