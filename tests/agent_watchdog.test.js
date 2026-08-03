const assert = require('node:assert/strict');
const test = require('node:test');

const { createHeartbeatController } = require('../agent/agent.js');

const OPEN = 1;

function fakeSocket({ sendError = null } = {}) {
  return {
    readyState: OPEN,
    sent: [],
    terminated: 0,
    send(payload) {
      if (sendError) throw sendError;
      this.sent.push(JSON.parse(payload));
    },
    terminate() {
      this.terminated += 1;
      this.readyState = 3;
    },
  };
}

function controller(options = {}) {
  return createHeartbeatController({
    pingIntervalMs: 1_000,
    pongTimeoutMs: 20,
    getLocalOk: () => true,
    logger: { error() {} },
    WebSocketImpl: { OPEN },
    ...options,
  });
}

test('terminates a WebSocket that does not answer the application heartbeat', async () => {
  const socket = fakeSocket();
  const heartbeat = controller();
  heartbeat.start(socket);
  try {
    await new Promise((resolve) => setTimeout(resolve, 45));
    assert.equal(socket.sent.length, 1);
    assert.deepEqual(socket.sent[0], { type: 'ping', local_ok: true });
    assert.equal(socket.terminated, 1);
  } finally {
    heartbeat.stop();
  }
});

test('keeps an acknowledged WebSocket open', async () => {
  const socket = fakeSocket();
  const heartbeat = controller();
  heartbeat.start(socket);
  heartbeat.acknowledge();
  try {
    await new Promise((resolve) => setTimeout(resolve, 45));
    assert.equal(socket.terminated, 0);
  } finally {
    heartbeat.stop();
  }
});

test('queues a changed local status until the in-flight heartbeat is acknowledged', () => {
  const socket = fakeSocket();
  const heartbeat = controller();
  heartbeat.start(socket);
  try {
    heartbeat.send(socket);
    assert.equal(socket.sent.length, 1);
    heartbeat.acknowledge();
    assert.equal(socket.sent.length, 2);
    heartbeat.acknowledge();
    assert.equal(socket.terminated, 0);
  } finally {
    heartbeat.stop();
  }
});

test('terminates immediately when a heartbeat cannot be sent', () => {
  const socket = fakeSocket({ sendError: new Error('socket unavailable') });
  const heartbeat = controller();
  heartbeat.start(socket);
  try {
    assert.equal(socket.terminated, 1);
  } finally {
    heartbeat.stop();
  }
});
