#!/usr/bin/env node
/**
 * auto-domain Agent
 * Usage: node agent.js [--token=TOKEN] [--port=3000] [--name=myapp] [--server=wss://tunnel-api.vyibc.com]
 */

const WebSocket = require('ws');

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.length ? v.join('=') : true];
    })
);

const PORT = parseInt(args.port || args.p || '3000', 10);
const TOKEN = args.token || args.t || '';
const NAME = args.name || args.n || '';
const SERVER = (args.server || 'wss://tunnel-api.chxyka.ccwu.cc').replace(/\/$/, '');

let reconnectDelay = 3000;

function buildWsUrl() {
  const base = SERVER.replace(/^http/, 'ws');
  const u = new URL(base);
  if (TOKEN) u.searchParams.set('token', TOKEN);
  if (NAME) u.searchParams.set('name', NAME);
  return u.toString();
}

function connect() {
  const wsUrl = buildWsUrl();
  console.log('[auto-domain] Connecting...');

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    reconnectDelay = 3000;
    console.log('[auto-domain] Connected. Waiting for assignment...');
  });

  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'connected') {
      console.log('\nTunnel is live');
      console.log(`Public URL : ${msg.url}`);
      console.log(`Forwarding : ${msg.url} -> http://localhost:${PORT}\n`);
    }

    if (msg.type === 'request') {
      handleRequest(ws, msg);
    }
  });

  ws.on('close', (code) => {
    console.log(`[auto-domain] Disconnected (${code}). Reconnecting in ${reconnectDelay / 1000}s...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });

  ws.on('error', (err) => {
    console.error(`[auto-domain] Error: ${err.message}`);
  });
}

async function handleRequest(ws, msg) {
  const localUrl = `http://localhost:${PORT}${msg.path}`;

  try {
    const hasBody = msg.body && !['GET', 'HEAD'].includes(msg.method.toUpperCase());
    const body = hasBody ? Buffer.from(msg.body, 'base64') : undefined;
    const headers = { ...msg.headers };
    delete headers.host;
    headers.host = `localhost:${PORT}`;

    const resp = await fetch(localUrl, {
      method: msg.method,
      headers,
      body,
      redirect: 'manual',
    });

    const respBuffer = Buffer.from(await resp.arrayBuffer());
    const respHeaders = {};
    resp.headers.forEach((v, k) => { respHeaders[k] = v; });

    ws.send(JSON.stringify({
      type: 'response',
      id: msg.id,
      status: resp.status,
      headers: respHeaders,
      body: respBuffer.toString('base64'),
    }));
  } catch (err) {
    console.error(`[auto-domain] Local request failed: ${err.message}`);
    ws.send(JSON.stringify({
      type: 'response',
      id: msg.id,
      status: 502,
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from(`Local service error: ${err.message}`).toString('base64'),
    }));
  }
}

connect();
