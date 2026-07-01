#!/bin/bash
# Headless Claude Code launcher — drop-in replacement for terminal-based
# launchers (e.g. Ghostty/iTerm wrappers). Runs `claude` in-place with a
# seeded prompt, no terminal window.
#
# Install:
#   mkdir -p ~/bin && cp scripts/claude-cl.sh ~/bin/ && chmod +x ~/bin/claude-cl.sh
#
# Usage in a launchd/cron script:
#   "$HOME/bin/claude-cl.sh" "$PROJECT_DIR" "$PROMPT_FILE" >> "$LOG" 2>&1
#
# Usage:
#   claude-cl.sh <project_dir> <prompt_file>
#   claude-cl.sh <project_dir> -           # read prompt from stdin
#
# Env:
#   CLAUDE_BIN         path to claude binary  (default: /opt/homebrew/bin/claude)
#   CLAUDE_CL_DETACH   =1 to fork claude to background (script returns immediately)

set -eu

PROJECT_DIR="${1:?usage: claude-cl.sh <project_dir> <prompt_file|->}"
PROMPT_SRC="${2:?usage: claude-cl.sh <project_dir> <prompt_file|->}"

CLAUDE="${CLAUDE_BIN:-/opt/homebrew/bin/claude}"

[[ -d "$PROJECT_DIR" ]] || { echo "claude-cl: dir not found: $PROJECT_DIR" >&2; exit 1; }
[[ -x "$CLAUDE" ]]     || { echo "claude-cl: claude not found at $CLAUDE (set CLAUDE_BIN)" >&2; exit 1; }

if [[ "$PROMPT_SRC" == "-" ]]; then
    PROMPT_CONTENT=$(cat)
else
    [[ -f "$PROMPT_SRC" ]] || { echo "claude-cl: prompt file not found: $PROMPT_SRC" >&2; exit 1; }
    PROMPT_CONTENT=$(cat "$PROMPT_SRC")
fi

cd "$PROJECT_DIR"

if [[ "${CLAUDE_CL_DETACH:-0}" == "1" ]]; then
    nohup "$CLAUDE" --dangerously-skip-permissions "$PROMPT_CONTENT" >/dev/null 2>&1 &
    echo "claude-cl: detached pid=$! dir=$PROJECT_DIR"
else
    exec "$CLAUDE" --dangerously-skip-permissions "$PROMPT_CONTENT"
fi
