# auto-domain CLI

`auto-domain` 用来把本地端口映射成一个可公开访问的 Cloudflare 域名。

## 1. 直接使用 CLI

不需要全局安装，直接运行：

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 --name=myapp
```

说明：

- 默认不需要 token，直接可以建立临时隧道。
- 如果你传了 `--token=atd-...`，脚本会保存到 `~/.auto-domain/config`，后续自动复用。
- 脚本会自动下载 agent、安装依赖并建立连接。
- 本机只需要 `Node.js >= 18`。
- 如果 `--name=myapp` 已被占用，系统会自动改成 `myapp-a7k3` 这类带随机后缀的可用域名。

## 2. 安装 AI 提示文件

如果你想让 Claude Code、Cursor 或其他 AI 工具更容易调用它，可以安装一份本地提示文件：

```bash
bash <(curl -fsSL https://skill.vyibc.com/install-auto-domain.sh)
```

这个脚本不会安装真正的程序，也不是 Cloudflare Worker 部署脚本。它只会在本地写入一份提示文件，方便你告诉 AI 工具如何使用 `auto-domain`。

安装后，你可以直接对 AI 工具说：

```text
给我的 3000 端口分配一个公网域名
```

## 3. 可选 token

`token` 现在不是必填项。它只用于后续扩展能力，例如：

- 更高配额
- 固定保留域名
- 隧道管理能力

示例：

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 --name=myapp --token=atd-xxxx
```

## 4. DNS 说明

公网域名需要正确的通配符 DNS 和 Worker 路由配置。

当前这套服务主要依赖：

- `tunnel-api.chxyka.ccwu.cc`
- `*.chxyka.ccwu.cc`
- `*.vyibc.com`
