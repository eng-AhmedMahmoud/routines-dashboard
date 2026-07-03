#!/bin/bash
# ensure-chrome.sh — pre-flight for claude-in-chrome MCP.
#
# When a scheduled routine wakes up at (say) 09:07 and Chrome isn't
# running, every mcp__claude-in-chrome__* tool call will return
# "not connected". This script guarantees Chrome is up and has at
# least one window before returning.
#
# Usage:
#   ensure-chrome.sh [--headless]
#     --headless  do NOT bring Chrome to front (leave user's foreground app alone)
#
# Exit codes:
#   0  Chrome is running with >=1 window
#   1  Chrome could not be started or has no window after timeout
#
# Env:
#   ENSURE_CHROME_TIMEOUT   seconds to wait (default: 20)

set -u

HEADLESS=0
if [[ "${1:-}" == "--headless" ]]; then HEADLESS=1; fi

TIMEOUT="${ENSURE_CHROME_TIMEOUT:-20}"
DEADLINE=$(( $(date +%s) + TIMEOUT ))

log() { echo "[ensure-chrome] $*" >&2; }

CHROME_BUNDLE_ID="com.google.Chrome"

chrome_running() {
    # `-x` matches exact process name. Google Chrome's helpers (Renderer, GPU)
    # do NOT match "Google Chrome" — only the top-level browser does. The
    # process name is always "Google Chrome" even when the bundle is named
    # "Chrome.app" (which is how Chrome for Testing / Canary ship).
    pgrep -x "Google Chrome" >/dev/null 2>&1
}

chrome_window_count() {
    if ! chrome_running; then echo 0; return; fi
    # `tell application id` uses the bundle identifier and works regardless of
    # what the .app is named on disk. Using the literal display name breaks
    # when the user has Chrome installed as Chrome.app rather than
    # "Google Chrome.app" (osascript -1728 error).
    /usr/bin/osascript -e "tell application id \"$CHROME_BUNDLE_ID\" to count of windows" 2>/dev/null || echo 0
}

chrome_app_arg() {
    # `open -a` accepts the bundle id via -b instead. This too is name-agnostic.
    echo "-b $CHROME_BUNDLE_ID"
}

# 1. Launch if not running
if ! chrome_running; then
    log "Chrome not running — launching (bundle: $CHROME_BUNDLE_ID)"
    if (( HEADLESS )); then
        # `open -g` = launch without activating (background). Prevents interrupting
        # whatever the user is focused on.
        /usr/bin/open -g -b "$CHROME_BUNDLE_ID"
    else
        /usr/bin/open -b "$CHROME_BUNDLE_ID"
    fi
    while (( $(date +%s) < DEADLINE )); do
        chrome_running && break
        sleep 0.5
    done
    if ! chrome_running; then
        log "FAILED — Chrome did not start within ${TIMEOUT}s"
        exit 1
    fi
fi

# 2. Wait for at least one window
while (( $(date +%s) < DEADLINE )); do
    count=$(chrome_window_count)
    if (( count > 0 )); then
        log "OK — Chrome has ${count} window(s)"
        exit 0
    fi
    sleep 0.5
done

# 3. Last-ditch: force a new window via bundle id
log "no windows after ${TIMEOUT}s — forcing new window"
/usr/bin/osascript -e "tell application id \"$CHROME_BUNDLE_ID\" to make new window" 2>/dev/null || true
sleep 2
count=$(chrome_window_count)
if (( count > 0 )); then
    log "OK — forced window count=${count}"
    exit 0
fi

log "FAILED — Chrome running but has 0 windows"
exit 1
