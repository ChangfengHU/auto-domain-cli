---
name: auto-domain
description: "当用户说"给我的服务分配公网域名"、"内网穿透"、"暴露本地服务"、"expose localhost"、 "给端口分配域名"、"公网访问本地"、"auto-domain"、"隧道"、"tunnel 端口"、 "把本地服务暴露出去"、"我需要一个公网地址" 时自动触发。 一键为本地任意端口的服务分配 *.chxyka.ccwu.cc 公网域名，零配置，无需服务器。"
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
