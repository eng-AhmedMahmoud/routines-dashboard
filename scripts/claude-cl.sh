#!/bin/bash
# Headless equivalent of ghostty-cl.sh.
# Runs `claude --dangerously-skip-permissions` in the target dir with a
# seeded prompt, no terminal window. Blocks until claude exits so parent
# scripts see exit codes and can capture output via their own redirection.
#
# Usage:
#   claude-cl.sh <project_dir> <prompt_file>
#   claude-cl.sh <project_dir> -           # read prompt from stdin
#
# Env:
#   CLAUDE_CL_DETACH=1         fork claude to background (returns immediately)
#   CLAUDE_CL_ENSURE_CHROME=1  run ~/bin/ensure-chrome.sh preflight before
#                              exec claude. Use for routines that need the
#                              mcp__claude-in-chrome__* tools (LinkedIn,
#                              browser scraping). Failing preflight aborts
#                              the run with exit 2 so launchd records the
#                              failure and the fire-outcome watcher can
#                              notify. Silently skipped when the preflight
#                              script is missing.

set -eu

PROJECT_DIR="${1:?usage: claude-cl.sh <project_dir> <prompt_file|->}"
PROMPT_SRC="${2:?usage: claude-cl.sh <project_dir> <prompt_file|->}"

CLAUDE="${CLAUDE_BIN:-/opt/homebrew/bin/claude}"

[[ -d "$PROJECT_DIR" ]] || { echo "claude-cl: dir not found: $PROJECT_DIR" >&2; exit 1; }
[[ -x "$CLAUDE" ]]     || { echo "claude-cl: claude not found at $CLAUDE" >&2; exit 1; }

if [[ "$PROMPT_SRC" == "-" ]]; then
    PROMPT_CONTENT=$(cat)
else
    [[ -f "$PROMPT_SRC" ]] || { echo "claude-cl: prompt file not found: $PROMPT_SRC" >&2; exit 1; }
    PROMPT_CONTENT=$(cat "$PROMPT_SRC")
fi

if [[ "${CLAUDE_CL_ENSURE_CHROME:-0}" == "1" ]]; then
    ENSURE="$HOME/bin/ensure-chrome.sh"
    if [[ -x "$ENSURE" ]]; then
        # Headless: don't yank the user's foreground app if we're firing
        # from a schedule while they're doing something else.
        if ! "$ENSURE" --headless; then
            echo "claude-cl: chrome preflight failed — aborting" >&2
            exit 2
        fi
    else
        echo "claude-cl: warning — CLAUDE_CL_ENSURE_CHROME=1 set but $ENSURE missing; skipping" >&2
    fi
fi

cd "$PROJECT_DIR"

if [[ "${CLAUDE_CL_DETACH:-0}" == "1" ]]; then
    nohup "$CLAUDE" --dangerously-skip-permissions "$PROMPT_CONTENT" >/dev/null 2>&1 &
    echo "claude-cl: detached pid=$! dir=$PROJECT_DIR"
else
    exec "$CLAUDE" --dangerously-skip-permissions "$PROMPT_CONTENT"
fi
