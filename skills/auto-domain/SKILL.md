---
name: auto-domain
description: "为本地端口分配一个可公开访问的 Cloudflare 域名；支持匿名临时隧道、可选 token，以及同名冲突自动加随机后缀。"
---

# Auto Domain

## Purpose

Use this skill when the user wants to expose a local port to the public internet through the auto-domain service.

The fixed install command is:

```bash
bash <(curl -fsSL 'https://skill.vyibc.com/install-auto-domain.sh?ts=...')
```

## Installed Location

The skill is installed as:

```text
~/.codex/skills/auto-domain
~/.claude/skills/auto-domain
~/.cursor/skills/auto-domain
```

depending on the selected install target.

## Execution

Run the helper script inside the installed skill directory:

```bash
~/.codex/skills/auto-domain/scripts/run.sh --port=3000 --name=myapp
```

If the user works in another client, replace the root path accordingly.

## Behavior

- No token is required for a temporary tunnel.
- If `--name=myapp` is already taken, the service automatically falls back to `myapp-xxxx`.
- If the user has an issued token, append `--token=atd-...`.
- Node.js 18 or newer is required on the local machine.

## Source of Truth

The single runtime source of truth is:

```text
skills/auto-domain/scripts/run.sh
```

After installation, the local skill runs this script directly. The public CLI
entry `https://skill.vyibc.com/auto-domain.sh` is also published from this same
script.

## Examples

Anonymous tunnel:

```bash
~/.codex/skills/auto-domain/scripts/run.sh --port=3000 --name=myapp
```

With token:

```bash
~/.codex/skills/auto-domain/scripts/run.sh --port=3000 --name=myapp --token=atd-xxxx
```
