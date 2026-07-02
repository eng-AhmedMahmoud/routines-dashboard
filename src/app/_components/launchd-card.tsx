"use client";

import { useEffect, useState, useTransition } from "react";
import type { LaunchdAgent, Schedule } from "@/lib/launchd";
import type { RoutineMetadata } from "@/lib/metadata";
import { LogPanel } from "./log-panel";
import { MetaEditor } from "./meta-editor";

type RunEvent = { ts: string; status: "ok" | "fail" | "unknown"; exitCode: number | null; durationMs: number | null };

function formatDur(ms: number | null): string {
  if (ms === null) return "?";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export function LaunchdCard({
  agent,
  meta,
  onChange,
  onMetaChange,
  selected = false,
  onToggleSelect,
}: {
  agent: LaunchdAgent;
  meta?: RoutineMetadata;
  onChange: () => void;
  onMetaChange: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [busy, startBusy] = useTransition();
  const [showLogs, setShowLogs] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [hour, setHour] = useState(getFirstSchedule(agent.schedule)?.hour ?? 9);
  const [minute, setMinute] = useState(getFirstSchedule(agent.schedule)?.minute ?? 0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunEvent[] | null>(null);

  useEffect(() => {
    if (!agent.stdoutPath) return;
    let alive = true;
    fetch(`/api/launchd/${labelEnc}/history`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d.runs)) setRuns(d.runs);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [agent.stdoutPath, agent.pid, agent.lastExitStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayName = meta?.display_name || agent.label;
  const isAliased = !!meta?.display_name && meta.display_name !== agent.label;

  const labelEnc = encodeURIComponent(agent.label);

  const post = async (path: string, body?: unknown) => {
    setFeedback(null);
    const res = await fetch(path, {
      method: path.endsWith("/schedule") ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setFeedback(`Error: ${data.error || res.statusText}`);
      setTimeout(() => setFeedback(null), 4000);
    } else {
      setFeedback("✓ done");
      setTimeout(() => setFeedback(null), 1500);
      onChange();
    }
  };

  const handleFire = () => startBusy(() => post(`/api/launchd/${labelEnc}/fire`));
  const handleToggle = () =>
    startBusy(() => post(`/api/launchd/${labelEnc}/toggle`, { enabled: !agent.enabled }));
  const handleSaveSchedule = () =>
    startBusy(async () => {
      await post(`/api/launchd/${labelEnc}/schedule`, { schedule: { hour, minute } });
      setEditing(false);
    });

  const scheduleText = describeSchedule(agent.schedule, agent.startInterval);
  const programText = agent.programArguments[0] ? truncateMid(agent.programArguments[0], 70) : "—";

  const failed = agent.lastExitStatus !== null && agent.lastExitStatus !== 0;
  const dotClass = failed ? "status-fail" : agent.enabled ? "status-on" : "status-off";
  const dotTitle = failed ? `failed (exit ${agent.lastExitStatus})` : agent.enabled ? "loaded" : "unloaded";

  return (
    <div
      className={`card-lift rounded-lg border bg-[var(--card)] ${
        selected ? "border-[var(--accent)]/60 shadow-[0_0_0_1px_var(--accent)]/30" : "border-[var(--border)]"
      }`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        {onToggleSelect && (
          <label
            className="batch-slot mt-0.5 shrink-0 cursor-pointer sm:mt-1.5"
            title="Select"
          >
            <input
              type="checkbox"
              className="batch-check"
              checked={selected}
              onChange={onToggleSelect}
            />
          </label>
        )}
        <span
          title={dotTitle}
          className={`status-dot ${dotClass} mt-1.5 shrink-0 sm:mt-2`}
          style={{ display: "inline-block" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all text-base font-semibold leading-tight">{displayName}</span>
            <span className="rounded bg-[var(--border)] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
              launchd
            </span>
            {meta?.tags?.map((t) => (
              <span
                key={t}
                className="rounded bg-[var(--blue)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--blue)]"
              >
                {t}
              </span>
            ))}
            {agent.pid !== null && (
              <span className="rounded bg-[var(--blue)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--blue)]">
                pid {agent.pid}
              </span>
            )}
            {agent.lastExitStatus !== null && agent.lastExitStatus !== 0 && (
              <span className="rounded bg-[var(--red)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--red)]">
                exit {agent.lastExitStatus}
              </span>
            )}
          </div>
          {meta?.description && (
            <p className="mt-1 text-sm text-[var(--text)]/80">{meta.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-[var(--muted)]">
            <span className="font-medium">{scheduleText}</span>
            {isAliased && (
              <span className="break-all font-mono text-xs opacity-70">{agent.label}</span>
            )}
            <span className="break-all font-mono text-xs opacity-70">{programText}</span>
          </div>
          {runs && runs.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="run-strip">
                {Array.from({ length: 10 }).map((_, i) => {
                  const idx = runs.length - 10 + i;
                  const r = idx >= 0 ? runs[idx] : null;
                  const cls = !r
                    ? "run-unknown"
                    : r.status === "ok"
                    ? "run-ok"
                    : r.status === "fail"
                    ? "run-fail"
                    : "run-unknown";
                  const title = r
                    ? `${new Date(r.ts).toLocaleString("en-GB", { hour12: false })} · ${r.status}${r.exitCode !== null ? ` (exit ${r.exitCode})` : ""}${r.durationMs !== null ? ` · ${formatDur(r.durationMs)}` : ""}`
                    : "no data";
                  return <span key={i} className={`run-dot ${cls}`} title={title} />;
                })}
              </span>
              <span className="text-xs text-[var(--muted)]">last {runs.length} runs</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {feedback && (
            <span
              className={`text-sm font-medium ${
                feedback.startsWith("Error")
                  ? "text-[var(--red)]"
                  : "text-[var(--green)]"
              }`}
            >
              {feedback}
            </span>
          )}
          <button
            disabled={busy}
            onClick={handleFire}
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--card-hover)] disabled:opacity-50"
          >
            Fire
          </button>
          <button
            disabled={busy}
            onClick={handleToggle}
            className={`rounded border px-3 py-1.5 text-sm font-medium hover:bg-[var(--card-hover)] disabled:opacity-50 ${
              agent.enabled
                ? "border-[var(--amber)]/40 text-[var(--amber)]"
                : "border-[var(--green)]/40 text-[var(--green)]"
            }`}
          >
            {agent.enabled ? "Disable" : "Enable"}
          </button>
          <button
            disabled={busy}
            onClick={() => setEditing(!editing)}
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--card-hover)] disabled:opacity-50"
          >
            Edit
          </button>
          {agent.stdoutPath && (
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="rounded border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--card-hover)]"
            >
              {showLogs ? "Hide" : "Logs"}
            </button>
          )}
          <button
            onClick={() => setEditingMeta(!editingMeta)}
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--card-hover)]"
            title="Rename or add description"
          >
            ✎
          </button>
        </div>
      </div>

      {editingMeta && (
        <MetaEditor
          metaKey={`launchd:${agent.label}`}
          initial={meta}
          defaultName={agent.label}
          onClose={() => setEditingMeta(false)}
          onSaved={onMetaChange}
        />
      )}

      {editing && (
        <div className="border-t border-[var(--border)] bg-[var(--card-hover)] px-4 py-4">
          <div className="flex flex-wrap items-center gap-3 text-base">
            <label className="flex items-center gap-2">
              Hour
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(parseInt(e.target.value || "0", 10))}
                className="w-20 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-base"
              />
            </label>
            <label className="flex items-center gap-2">
              Minute
              <input
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(e) => setMinute(parseInt(e.target.value || "0", 10))}
                className="w-20 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-base"
              />
            </label>
            <div className="ml-auto flex gap-2">
              <button
                disabled={busy}
                onClick={handleSaveSchedule}
                className="rounded bg-[var(--blue)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save & Reload
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded border border-[var(--border)] px-4 py-1.5 text-sm font-medium hover:bg-[var(--card)]"
              >
                Cancel
              </button>
            </div>
          </div>
          <p className="mt-3 break-all text-xs text-[var(--muted)]">
            Writes <code className="font-mono">{shortPath(agent.plistPath)}</code>, runs{" "}
            <code className="font-mono">plutil -lint</code>, then unload+load. Backup at{" "}
            <code className="font-mono">{shortPath(agent.plistPath)}.bak</code>.
          </p>
        </div>
      )}

      {showLogs && agent.stdoutPath && <LogPanel label={agent.label} stderr={false} />}
    </div>
  );
}

function getFirstSchedule(s: Schedule | Schedule[] | null): Schedule | null {
  if (!s) return null;
  if (Array.isArray(s)) return s[0] ?? null;
  return s;
}

function describeSchedule(s: Schedule | Schedule[] | null, interval: number | null): string {
  if (interval) return `every ${interval}s`;
  if (!s) return "no schedule";
  const arr = Array.isArray(s) ? s : [s];
  const wdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return arr
    .map((x) => {
      const hh = (x.hour ?? 0).toString().padStart(2, "0");
      const mm = (x.minute ?? 0).toString().padStart(2, "0");
      const wd = x.weekday !== undefined ? ` · ${wdays[x.weekday] || `wd${x.weekday}`}` : "";
      return `daily ${hh}:${mm}${wd}`;
    })
    .join(", ");
}

function truncateMid(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n / 2 - 2) + "…" + s.slice(s.length - n / 2 + 2);
}

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~");
}
