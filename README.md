# auto-domain

把本地端口映射成可公开访问的 Cloudflare 域名，基于 WebSocket 反向隧道，无需服务器。

## 快速开始

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) \
  --port=3000 --name=myapp --token=YOUR_TOKEN --daemon
```

成功后输出：

```
Tunnel is live!
   Public URL : https://myapp.chxyka.ccwu.cc
   Forwarding : https://myapp.chxyka.ccwu.cc -> http://localhost:3000
   Logs       : tail -f ~/.auto-domain/agent.log
   Stop       : bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --stop
```

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--port` | 是 | 本地端口 |
| `--name` | 否 | 子域名（如 `myapp` → `myapp.chxyka.ccwu.cc`） |
| `--token` | 是 | 认证 token（向管理员申请） |
| `--daemon` | 是 | 后台运行，打印公网 URL 后退出，Claude 可读取结果 |
| `--stop` | 否 | 停止后台 agent |
| `--reset` | 否 | 清除本地缓存重新初始化 |

> **⚠️ 必须使用 `--daemon`**：不加此参数脚本会阻塞，Claude 永远收不到 URL 反馈。

## 停止隧道

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --stop
```

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| `invalid token` | token 不存在或已失效 | 联系管理员重新申请 |
| `subdomain already in use` | 该子域名正被其他隧道占用 | 换一个 `--name` |
| Timed out | 连接超时 | 检查 `tail -f ~/.auto-domain/agent.log` |

## 安装为 Claude Code Skill

```bash
bash <(curl -fsSL https://skill.vyibc.com/install-auto-domain.sh)
```

安装后 Claude 会在用户说"暴露本地服务"、"内网穿透"、"给端口分配公网域名"等时自动触发。

安装完成后执行：

```bash
~/.claude/skills/auto-domain/scripts/run.sh --port=3000 --name=myapp --token=YOUR_TOKEN --daemon
```

## 仓库结构

```text
README.md
agent/
  agent.js          # Agent 本体（WebSocket 客户端 + 心跳）
  package.json
scripts/
  auto-domain.sh        # CLI 直接执行入口（同步到 skill.vyibc.com）
  install-auto-domain.sh
  publish-auto-domain.sh
  publish-skill.sh      # 维护者发布脚本
  upload-file.sh
skills/
  auto-domain/
    SKILL.md            # Claude Code skill 定义
    scripts/run.sh      # skill 执行脚本（与 auto-domain.sh 同步）
    agent/agent.js      # skill 内置 agent
    agent/package.json
```

## 维护者发布流程

修改客户端文件后，在 `cloudflare-youtube-pipeline/auto-domain-tunnel/` 目录执行：

```bash
bash sync-client.sh \
  --token=GITHUB_PAT \
  --cf-key=CF_API_KEY \
  --cf-email=CF_EMAIL
```

同步范围：
- `agent.js` → `auto-domain-cli/agent/agent.js` + R2
- `run.sh` → `auto-domain-cli/skills/auto-domain/scripts/run.sh` + R2
- `SKILL.md` → `auto-domain-cli/skills/auto-domain/SKILL.md`

或直接使用仓库内发布脚本：

```bash
bash <(curl -fsSL https://skill.vyibc.com/publish-auto-domain.sh)
```

## 服务端

Worker 代码维护在：https://github.com/ChangfengHU/cloudflare-youtube-pipeline/tree/main/auto-domain-tunnel

## DNS 说明

- Agent 连接：`wss://tunnel-api.chxyka.ccwu.cc`
- 公网访问：`*.chxyka.ccwu.cc`
