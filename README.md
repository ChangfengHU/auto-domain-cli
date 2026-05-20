# auto-domain CLI

Expose a local service through a public Cloudflare URL.

## CLI tool

Run directly without installing globally:

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 --name=myapp
```

- First run asks for a token and saves it to `~/.auto-domain/config`.
- Later runs reuse the saved token.
- The script downloads the agent, installs dependencies, and connects the tunnel.
- Requires local Node.js 18 or newer.
- If `--name=myapp` is already in use, the service automatically falls back to a random suffix such as `myapp-a7k3`.

## AI tool helper

Install helper notes for AI tools:

```bash
bash <(curl -fsSL https://skill.vyibc.com/install-auto-domain.sh)
```

After installing, ask your AI tool to expose a local port, for example:

```text
Give my port 3000 a public domain
```

## Token

Use your issued `atd-...` token when prompted by the CLI. Do not commit real tokens to source control.

## DNS

Wildcard DNS must route the public domains to Cloudflare. The tunnel worker currently manages `*.chxyka.ccwu.cc`; additional domains such as `*.vyibc.com` require matching DNS and Worker route configuration.
