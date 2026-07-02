"use client";

import { useState, useTransition } from "react";
import cronstrue from "cronstrue";
import type { CloudTrigger } from "@/lib/cloud";
import type { RoutineMetadata } from "@/lib/metadata";
import { MetaEditor } from "./meta-editor";

function humanizeCron(expr: string | null | undefined): string | null {
  if (!expr) return null;
  try {
    return cronstrue.toString(expr, { verbose: false, use24HourTimeFormat: true });
  } catch {
    return null;
  }
}

export function CloudCard({
  trigger,
  meta,
  onChange,
  onMetaChange,
  selected = false,
  onToggleSelect,
}: {
  trigger: CloudTrigger;
  meta?: RoutineMetadata;
  onChange: () => void;
  onMetaChange: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [busy, startBusy] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [cron, setCron] = useState(trigger.cron_expression || "");
  const [name, setName] = useState(trigger.name);
  const [feedback, setFeedback] = useState<string | null>(null);

  const displayName = meta?.display_name || trigger.name;
  const isAliased = !!meta?.display_name && meta.display_name !== trigger.name;

  const post = async (path: string, body?: unknown, method: "POST" | "PATCH" = "POST") => {
    setFeedback(null);
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      setFeedback(`Error: ${data.error || res.statusText}`);
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFeedback("✓ done");
      setTimeout(() => setFeedback(null), 1500);
      onChange();
    }
  };

  const handleFire = () => startBusy(() => post(`/api/cloud/${trigger.id}/fire`, {}));
  const handleToggle = () =>
    startBusy(() => post(`/api/cloud/${trigger.id}/toggle`, { enabled: !trigger.enabled }));
  const handleSave = () =>
    startBusy(async () => {
      const patch: Record<string, string> = {};
      if (name !== trigger.name) patch.name = name;
      if (cron && cron !== trigger.cron_expression) patch.cron_expression = cron;
      if (Object.keys(patch).length === 0) {
        setEditing(false);
        return;
      }
      await post(`/api/cloud/${trigger.id}/schedule`, patch, "PATCH");
      setEditing(false);
    });
  const handleDelete = () => {
    if (!confirm(`Delete trigger "${trigger.name}"? This cannot be undone.`)) return;
    startBusy(() => post(`/api/cloud/${trigger.id}/delete`, {}));
  };

  const cronHuman = humanizeCron(trigger.cron_expression);
  const scheduleText = cronHuman
    ? cronHuman
    : trigger.cron_expression
    ? `cron ${trigger.cron_expression}`
    : trigger.run_once_at
    ? `once at ${trigger.run_once_at}`
    : "manual";
  const nextRun = trigger.next_run_at
    ? new Date(trigger.next_run_at).toLocaleString("en-GB", { hour12: false })
    : "—";

  const dotClass = trigger.enabled ? "status-on" : "status-off";

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
          className={`status-dot ${dotClass} mt-1.5 shrink-0 sm:mt-2`}
          style={{ display: "inline-block" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold leading-tight">{displayName}</span>
            <span className="rounded bg-[var(--purple)]/15 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--purple)]">
              cloud
            </span>
            {meta?.tags?.map((t) => (
              <span
                key={t}
                className="rounded bg-[var(--blue)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--blue)]"
              >
                {t}
              </span>
            ))}
            {meta?.n8n_webhook_url && (
              <span
                className="rounded bg-[var(--purple)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--purple)]"
                title={`Fires POST to ${meta.n8n_webhook_url}`}
              >
                → n8n
              </span>
            )}
            {trigger.ended_reason && (
              <span className="rounded bg-[var(--amber)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--amber)]">
                {trigger.ended_reason}
              </span>
            )}
          </div>
          {meta?.description && (
            <p className="mt-1 text-sm text-[var(--text)]/80">{meta.description}</p>
          )}
          {meta?.detailed_description && (
            <details className="mt-1.5 group">
              <summary className="cursor-pointer list-none text-xs font-medium text-[var(--accent)] hover:underline">
                <span className="inline-block transition-transform group-open:rotate-90">▸</span>{" "}
                Details
              </summary>
              <pre className="mt-1.5 whitespace-pre-wrap rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-xs leading-relaxed text-[var(--text)]/85">
                {meta.detailed_description}
              </pre>
            </details>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-[var(--muted)]">
            <span className="font-medium">{scheduleText}</span>
            <span>next: {nextRun}</span>
            {isAliased && (
              <span className="break-all font-mono text-xs opacity-70" title={trigger.name}>
                {truncateMid(trigger.name, 50)}
              </span>
            )}
            <span className="break-all font-mono text-xs opacity-70">{trigger.id}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {feedback && (
            <span
              className={`text-sm font-medium ${
                feedback.startsWith("Error") ? "text-[var(--red)]" : "text-[var(--green)]"
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
              trigger.enabled
                ? "border-[var(--amber)]/40 text-[var(--amber)]"
                : "border-[var(--green)]/40 text-[var(--green)]"
            }`}
          >
            {trigger.enabled ? "Disable" : "Enable"}
          </button>
          <button
            disabled={busy}
            onClick={() => setEditing(!editing)}
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--card-hover)] disabled:opacity-50"
          >
            Edit
          </button>
          <button
            disabled={busy}
            onClick={handleDelete}
            className="rounded border border-[var(--red)]/40 px-3 py-1.5 text-sm font-medium text-[var(--red)] hover:bg-[var(--red)]/10 disabled:opacity-50"
          >
            Delete
          </button>
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
          metaKey={`cloud:${trigger.id}`}
          initial={meta}
          defaultName={trigger.name}
          onClose={() => setEditingMeta(false)}
          onSaved={onMetaChange}
        />
      )}
      {editing && (
        <div className="border-t border-[var(--border)] bg-[var(--card-hover)] px-4 py-4">
          <div className="flex flex-col gap-3 text-base">
            <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="w-20 shrink-0 text-sm font-medium text-[var(--muted)]">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-base"
              />
            </label>
            <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="w-20 shrink-0 text-sm font-medium text-[var(--muted)]">Cron</span>
              <input
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="m h dom mon dow"
                className="flex-1 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-base"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={busy}
                onClick={handleSave}
                className="rounded bg-[var(--blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--card)]"
              >
                Cancel
              </button>
              <span className="ml-auto text-xs text-[var(--muted)]">
                Cron minimum is hourly.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function truncateMid(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n / 2 - 2) + "…" + s.slice(s.length - n / 2 + 2);
}
