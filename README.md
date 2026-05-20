# auto-domain

`auto-domain` 用来把本地端口映射成一个可公开访问的 Cloudflare 域名。

对外只需要记住两个命令：

## 1. 直接执行 CLI

不需要安装 skill，直接运行：

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 --name=myapp
```

说明：

- 默认不需要 token，直接可以建立临时隧道。
- 如果你传了 `--token=atd-...`，脚本会保存到 `~/.auto-domain/config`，后续自动复用。
- 脚本会自动下载 agent、安装依赖并建立连接。
- 本机只需要 `Node.js >= 18`。
- 如果 `--name=myapp` 已被占用，系统会自动改成 `myapp-a7k3` 这类带随机后缀的可用域名。

## 2. 安装 skill

这个命令会把 `auto-domain` 作为一个真正的 skill 安装到目标目录，例如：

- `~/.codex/skills/auto-domain`
- `~/.claude/skills/auto-domain`
- `~/.cursor/skills/auto-domain`

安装命令：

```bash
bash <(curl -fsSL 'https://skill.vyibc.com/install-auto-domain.sh?ts=20260520175219')
```

安装完成后，skill 里会自带：

- `SKILL.md`
- `scripts/run.sh`
- `agent/agent.js`
- `agent/package.json`

skill 内部通过 `scripts/run.sh` 调用 auto-domain 服务。

例如在 Codex 环境里可以执行：

```bash
~/.codex/skills/auto-domain/scripts/run.sh --port=3000 --name=myapp
```

## 3. `publish-skill.sh` 是做什么的

这个脚本是仓库维护者使用的发布脚本：

```bash
./scripts/publish-skill.sh
```

它负责生成和刷新 skill 这一条对外入口的发布产物：

1. 打包最新 `skills/auto-domain/`
2. 上传新的 skill zip
3. 基于最新 `publish-skill` 安装器模板生成 `install-auto-domain.sh`
4. 输出新的安装命令

也就是说，它负责生产这条命令背后的内容：

```bash
bash <(curl -fsSL 'https://skill.vyibc.com/install-auto-domain.sh?ts=...')
```

它**不负责** CLI 这条命令：

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 --name=myapp
```

CLI 入口来自 `scripts/auto-domain.sh`。

## 4. 维护者发布流程

当你修改了 `skills/auto-domain/` 后，发布流程是：

```bash
./scripts/publish-skill.sh
```

脚本会输出：

```text
ZIP_URL=...
INSTALL_COMMAND=bash <(curl -fsSL 'https://skill.vyibc.com/install-auto-domain.sh?ts=...')
```

然后把输出的 `INSTALL_COMMAND` 发给使用者即可。

这样做的原因：

- 安装脚本会自动跟随 `publish-skill` 的最新模板
- URL 会带 `ts=时间戳`，避免缓存导致安装旧版本

## 5. 仓库结构

```text
README.md
scripts/
  auto-domain.sh
  install-auto-domain.sh
  publish-skill.sh
  upload-file.sh
skills/
  auto-domain/
    SKILL.md
    scripts/run.sh
    agent/agent.js
    agent/package.json
agent/
  agent.js
  package.json
```

说明：

- `scripts/auto-domain.sh` 是直接给人执行的 CLI 入口
- `scripts/install-auto-domain.sh` 是固定的 skill 安装入口
- `scripts/publish-skill.sh` 是维护者发布 skill 用的脚本
- `skills/auto-domain/` 是真正会被安装下去的 skill 内容
- `agent/` 是 CLI 模式使用的 agent 源码

## 6. 可选 token

`token` 不是必填项。它只用于后续扩展能力，例如：

- 更高配额
- 固定保留域名
- 隧道管理能力

示例：

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 --name=myapp --token=atd-xxxx
```

## 7. DNS 说明

公网域名需要正确的通配符 DNS 和 Worker 路由配置。

当前这套服务主要依赖：

- `tunnel-api.chxyka.ccwu.cc`
- `*.chxyka.ccwu.cc`
- `*.vyibc.com`
