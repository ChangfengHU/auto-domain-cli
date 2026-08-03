---
name: auto-domain
description: 为本地任意端口分配 *.chxyka.ccwu.cc 公网域名并守护长连接。用户要求内网穿透、暴露 localhost、给端口分配域名、建立 auto-domain 隧道或恢复失效隧道时使用。
---

# Auto Domain

## Purpose

Use this skill when the user wants to expose a local port to the public internet through the auto-domain service.

## Execution

Run the helper script in **daemon mode** so it exits after printing the public URL:

```bash
~/.claude/skills/auto-domain/scripts/run.sh --port=3000 --name=myapp --daemon
```

> **Important:** Always use `--daemon`. Without it the script blocks forever and Claude never receives the URL.

To stop the background agent:

```bash
~/.claude/skills/auto-domain/scripts/run.sh --stop
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--port`  | Yes | Local port to expose |
| `--name`  | No  | Subdomain name (e.g. `myapp` → `myapp.chxyka.ccwu.cc`) |
| `--token` | No  | Auth token if issued |
| `--daemon`| Yes | Run in background, print URL and exit |
| `--stop`  | No  | Stop the running background agent |

## Behavior

- Starts agent in background, waits up to 20s for tunnel to come online.
- Prints public URL on success, then exits — Claude can read and show the URL.
- If `--name` is already taken: reports error immediately (does not time out).
- If token is invalid: reports error immediately.
- Re-running the same command while tunnel is alive prints the existing URL without restarting.
- Sends an application heartbeat every 30 seconds. If no `pong` arrives within
  15 seconds, terminates the stale WebSocket so the reconnect loop restores the
  tunnel without waiting for the operating system's TCP timeout.

## Examples

Expose port 3000:

```bash
~/.claude/skills/auto-domain/scripts/run.sh --port=3000 --name=myapp --daemon
```

With token:

```bash
~/.claude/skills/auto-domain/scripts/run.sh --port=3000 --name=myapp --token=myproxy-token-2026 --daemon
```

Stop the tunnel:

```bash
~/.claude/skills/auto-domain/scripts/run.sh --stop
```

## Expected Output

```
Agent started in background (PID: 12345)...
Waiting for tunnel to come online...

Tunnel is live!
   Public URL : https://myapp.chxyka.ccwu.cc
   Forwarding : https://myapp.chxyka.ccwu.cc -> http://localhost:3000
   Logs       : tail -f ~/.auto-domain/agent.log
   Stop       : bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --stop
```
