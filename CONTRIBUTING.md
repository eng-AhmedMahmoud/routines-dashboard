# Contributing to Routines Dashboard

Thanks for taking a look! This project is small and the bar for contributing is low — if something's broken, missing, or could be better, send a PR.

## Quick guide

1. **Open an issue first** if your change is non-trivial. A 10-line discussion saves a 200-line refactor.
2. **Fork → branch → PR.** Keep PRs focused. One concern per PR.
3. **Match the existing style.** Tailwind utility-first, function components, Server Components where possible.
4. **Run the typecheck** before opening a PR: `pnpm dlx tsc --noEmit`
5. **Smoke test** your change on at least one real launchd agent and one real cloud trigger.

## Dev setup

```bash
git clone <your-fork>
cd routines-dashboard
pnpm install
pnpm dev
# or: portless routines -- pnpm dev
```

The launchd pane works out of the box. The cloud pane needs Claude Code logged in locally (`claude login`).

## Good first issues

Look for the [`good first issue`](../../labels/good%20first%20issue) label. Concrete examples that already qualify:

- Add a "next 5 runs" preview for cron expressions
- Add a light theme
- Add a "duplicate" button on cloud triggers
- Render cron expressions in human-readable form (use `cronstrue` or roll your own)
- Add a `--port` flag / `PORT` env var doc
- Add basic Vitest tests for `lib/launchd.ts` plist parsing

## Scope guidelines

This is a **local-first dashboard**. Things that fit:

- More schedulers to read (cron, systemd, GitHub Actions read-only view)
- Better UI for the schedulers already supported
- Quality-of-life features: search, filter, bulk ops, keyboard shortcuts
- Tests, types, accessibility, perf

Things that probably don't fit (open an issue first to discuss):

- Multi-user / auth / cloud-hosted version
- Anything that requires running a service on someone else's machine
- Anything that requires a paid backend

## Reporting bugs

Use the bug template in `.github/ISSUE_TEMPLATE/`. Always include:
- macOS version
- Node version (`node -v`)
- One sample plist (redacted) if the bug is launchd-related
- Steps to reproduce
- What you expected vs. what happened

## Security

If you find something that looks like a security issue (token leak, plist injection, anything that exfiltrates data), please **don't** open a public issue. See [SECURITY.md](./SECURITY.md).

## Code of conduct

Be kind. Assume good faith. If you wouldn't say it in person, don't say it in a review.
