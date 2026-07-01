# Routines Dashboard

> One pane for every scheduled task on your machine and in your cloud.

A local-first, dark-mode dashboard to manage **macOS `launchd` agents** and **Claude Code Remote routines** side by side. No more digging through `~/Library/LaunchAgents/`, no more bouncing between `launchctl` and claude.ai/code. Fire, toggle, edit schedules, tail logs — all from one URL.

![Routines Dashboard screenshot](docs/screenshot.png)

---

## Why

If you live on macOS and run a few things on a schedule — daily scripts, cloud routines, background daemons — your scheduler is split across at least two places that don't talk to each other:

- macOS `launchd` (the plist + `launchctl` combo)
- Claude Code Remote routines (claude.ai/code dashboard)
- Maybe `cron`, GitHub Actions, systemd if you cross machines

Each one has its own UI, its own naming, its own enable/disable dance. Routines Dashboard reads them all, surfaces them as cards, and lets you act on them without leaving the keyboard.

Local-first by design. The dashboard runs on your machine, reads plists directly from disk, and talks to Claude Code Remote with **your own OAuth token from the macOS Keychain** — no third-party server in the middle.

## Features

- **Unified view** — every LaunchAgent + every Claude Code Remote trigger in one list
- **Fire now** — manually trigger any routine without remembering its label or trigger ID
- **Toggle enable/disable** — flips `launchctl load/unload` for local agents, `update_trigger` for cloud
- **Edit schedule** — change `Hour`/`Minute` for plists or cron expression for cloud, with backup + `plutil -lint` safety
- **Live log tail** — Server-Sent Events stream of stdout/stderr per agent
- **Friendly metadata** — give each routine a display name, description, and tags (stored in `~/.config/routines-dashboard/metadata.json`)
- **Filter** — search by name, description, or tag
- **Dark theme** — built for late-night maintenance windows

## Quick start

Requirements:
- macOS (the launchd integration is Mac-specific)
- Node 20+ (Node 24 recommended)
- `pnpm`
- [`portless`](https://github.com/coder-skull/portless) (optional, for HTTPS at `https://routines.localhost`)
- Claude Code CLI logged in (only if you want the cloud routines pane; the launchd pane works without it)

```bash
git clone https://github.com/OWNER/routines-dashboard.git
cd routines-dashboard
pnpm install

# Option A: portless (recommended — HTTPS + clean hostname)
portless routines -- pnpm dev
# → https://routines.localhost

# Option B: plain HTTP
pnpm dev
# → http://localhost:3000
```

The dashboard auto-discovers every plist in `~/Library/LaunchAgents/`. If you've authenticated Claude Code (`claude login`), the cloud pane fills in automatically using the OAuth token from your Keychain.

## Native Mac app (optional)

Prefer clicking an icon in the Dock over `pnpm start` in a terminal? Install a WKWebView wrapper as a real `.app` bundle:

```bash
./scripts/install-mac-app.sh
# → /Applications/Routines Dashboard.app
```

The installer builds a tiny native launcher (~90 KB Swift binary) that:
- checks whether the dashboard server is already running,
- runs `pnpm build && pnpm start` (via `portless` if installed) if it isn't,
- opens a native window pointed at the dashboard.

Parameterize with env vars: `APP_NAME`, `URL`, `PORTLESS_NAME`, `PROJECT_DIR`, `INSTALL_DIR`. Requires Xcode Command Line Tools (`xcode-select --install`).

## Headless routine runner (optional)

If your `launchd` scripts currently open a terminal window (Ghostty, iTerm, Terminal.app) to run `claude`, `scripts/claude-cl.sh` is a drop-in headless replacement:

```bash
mkdir -p ~/bin && cp scripts/claude-cl.sh ~/bin/ && chmod +x ~/bin/claude-cl.sh
```

Then in your run scripts:

```bash
"$HOME/bin/claude-cl.sh" "$PROJECT_DIR" "$PROMPT_FILE" >> "$LOG" 2>&1
```

No terminal window pops up on scheduled runs. Set `CLAUDE_CL_DETACH=1` if you want fire-and-forget.

## How it works

```
┌─────────────────────────────────────────────────────┐
│                  Next.js dashboard                  │
│              (Server Components + API)              │
└─────┬───────────────────────────────┬───────────────┘
      │                               │
      │ Read plists                   │ HTTPS + Bearer
      │ Exec launchctl                │ (OAuth token via
      │ Tail stdout/stderr            │  macOS Keychain)
      │                               │
      ▼                               ▼
 ~/Library/LaunchAgents/      api.anthropic.com/v1/
 launchctl (subprocess)        code/mcp/meta (MCP)
```

- **launchd pane** uses `plutil -convert json` to parse, `launchctl` for fire/load/unload, atomic file rewrite + `plutil -lint` for schedule edits (with `.bak` backup).
- **Cloud pane** reads the Claude Code OAuth token via `security find-generic-password -s "Claude Code-credentials"` and calls `https://api.anthropic.com/v1/code/mcp/meta` directly. No token leaves your machine.
- **Metadata** (display name, description, tags) lives in `~/.config/routines-dashboard/metadata.json` — a simple keyed JSON that's never sent anywhere.

## Roadmap

- [ ] More schedulers: GitHub Actions, cron, systemd (Linux), Windows Task Scheduler
- [ ] Execution timeline — when did this routine fire, what was the exit code, how long did it take
- [ ] Cron expression builder (visual)
- [ ] Bulk operations (disable all weekend agents)
- [ ] Notifications on failure (desktop notification, optional WhatsApp/Slack/email webhook)
- [ ] CLI companion (`routines fire <name>`, `routines list --json`)
- [ ] Homebrew formula + auto-launchd for the dashboard itself
- [ ] Light theme

See [open issues](../../issues) for current ideas and pick a [`good first issue`](../../labels/good%20first%20issue) if you want to jump in.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). The code is small (~1k lines of TS/TSX), the surface area is well-bounded, and there's plenty of low-hanging fruit (more schedulers, better UI, tests).

## Security

The dashboard reads your Claude Code OAuth token from the macOS Keychain at request time and uses it as a bearer token against `api.anthropic.com`. Nothing is logged, persisted, or sent elsewhere. If you find a security issue, please see [SECURITY.md](./SECURITY.md) before opening a public issue.

## License

GPLv3 — see [LICENSE](./LICENSE). Copyleft: forks and derivatives must ship their source under GPLv3.

## Acknowledgements

Built with [Next.js](https://nextjs.org), [Tailwind](https://tailwindcss.com), and a healthy disdain for context-switching between four tabs to fire one cron job.
