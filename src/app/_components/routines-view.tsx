"use client";

import { useMemo, useState, useTransition } from "react";
import type { LaunchdAgent } from "@/lib/launchd";
import type { CloudTrigger } from "@/lib/cloud";
import type { RoutineMetadata } from "@/lib/metadata";
import { LaunchdCard } from "./launchd-card";
import { CloudCard } from "./cloud-card";

type Tab = "all" | "local" | "cloud";
type StatusFilter = "any" | "enabled" | "disabled" | "failing";

type SelectionKey =
  | { kind: "launchd"; label: string }
  | { kind: "cloud"; id: string };

const selKey = (s: SelectionKey): string =>
  s.kind === "launchd" ? `launchd:${s.label}` : `cloud:${s.id}`;

export function RoutinesView({
  initialAgents,
  initialTriggers,
  initialMetadata,
  initialErrors,
  cloudEnabled = false,
}: {
  initialAgents: LaunchdAgent[];
  initialTriggers: CloudTrigger[];
  initialMetadata: Record<string, RoutineMetadata>;
  initialErrors: { launchd: string | null; cloud: string | null };
  cloudEnabled?: boolean;
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [triggers, setTriggers] = useState(initialTriggers);
  const [metadata, setMetadata] = useState(initialMetadata);
  const [errors, setErrors] = useState(initialErrors);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("any");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  const exitBatch = () => {
    setBatchMode(false);
    setSelection(new Set());
    setBatchFeedback(null);
  };

  const refresh = () => {
    startRefresh(async () => {
      const [agentsRes, triggersRes, metaRes] = await Promise.all([
        fetch("/api/launchd/list", { cache: "no-store" }).then((r) => r.json()),
        cloudEnabled
          ? fetch("/api/cloud/list", { cache: "no-store" }).then((r) => r.json())
          : Promise.resolve({ triggers: [], error: null }),
        fetch("/api/metadata", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (agentsRes.agents) setAgents(agentsRes.agents);
      if (triggersRes.triggers) setTriggers(triggersRes.triggers);
      if (metaRes.items) setMetadata(metaRes.items);
      setErrors({
        launchd: agentsRes.error || null,
        cloud: cloudEnabled ? triggersRes.error || null : null,
      });
    });
  };

  const refreshMetadataOnly = async () => {
    const metaRes = await fetch("/api/metadata", { cache: "no-store" }).then((r) => r.json());
    if (metaRes.items) setMetadata(metaRes.items);
  };

  const q = query.toLowerCase();
  const matchesQuery = (text: string, meta?: RoutineMetadata) =>
    text.toLowerCase().includes(q) ||
    (meta?.display_name || "").toLowerCase().includes(q) ||
    (meta?.description || "").toLowerCase().includes(q);

  const passesStatus = (enabled: boolean, failing: boolean): boolean => {
    if (status === "any") return true;
    if (status === "enabled") return enabled;
    if (status === "disabled") return !enabled;
    if (status === "failing") return failing;
    return true;
  };

  const filteredAgents = agents.filter((a) => {
    if (!matchesQuery(a.label, metadata[`launchd:${a.label}`])) return false;
    const failing = a.lastExitStatus !== null && a.lastExitStatus !== 0;
    return passesStatus(a.enabled, failing);
  });
  const filteredTriggers = triggers.filter((t) => {
    const matches =
      matchesQuery(t.name, metadata[`cloud:${t.id}`]) ||
      t.id.toLowerCase().includes(q) ||
      (t.cron_expression || "").toLowerCase().includes(q);
    if (!matches) return false;
    return passesStatus(t.enabled, false);
  });

  const counts = {
    any: agents.length + triggers.length,
    enabled: agents.filter((a) => a.enabled).length + triggers.filter((t) => t.enabled).length,
    disabled: agents.filter((a) => !a.enabled).length + triggers.filter((t) => !t.enabled).length,
    failing: agents.filter((a) => a.lastExitStatus !== null && a.lastExitStatus !== 0).length,
  };
  const statusChips: { key: StatusFilter; label: string; count: number }[] = [
    { key: "any", label: "All", count: counts.any },
    { key: "enabled", label: "Enabled", count: counts.enabled },
    { key: "disabled", label: "Disabled", count: counts.disabled },
    { key: "failing", label: "Failing", count: counts.failing },
  ];

  const showLocal = tab !== "cloud";
  const showCloud = cloudEnabled && tab !== "local";
  const tabs: Tab[] = cloudEnabled ? ["all", "local", "cloud"] : ["all"];

  // Selection helpers.
  const toggle = (key: SelectionKey) => {
    const k = selKey(key);
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  const clearSelection = () => setSelection(new Set());
  const selectAllVisible = () => {
    const next = new Set<string>();
    filteredAgents.forEach((a) => next.add(selKey({ kind: "launchd", label: a.label })));
    filteredTriggers.forEach((t) => next.add(selKey({ kind: "cloud", id: t.id })));
    setSelection(next);
  };

  const selectedItems = useMemo(() => {
    const items: SelectionKey[] = [];
    agents.forEach((a) => {
      if (selection.has(selKey({ kind: "launchd", label: a.label }))) {
        items.push({ kind: "launchd", label: a.label });
      }
    });
    triggers.forEach((t) => {
      if (selection.has(selKey({ kind: "cloud", id: t.id }))) {
        items.push({ kind: "cloud", id: t.id });
      }
    });
    return items;
  }, [selection, agents, triggers]);

  const runBatch = async (
    op: "enable" | "disable" | "fire" | "delete",
    confirmMsg?: string,
  ) => {
    if (selectedItems.length === 0) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBatchBusy(true);
    setBatchFeedback(null);

    let ok = 0;
    let fail = 0;
    const errorSamples: string[] = [];

    const perform = async (s: SelectionKey) => {
      try {
        if (s.kind === "launchd") {
          if (op === "delete") return; // no-op — launchd has no delete API
          if (op === "fire") {
            const r = await fetch(`/api/launchd/${encodeURIComponent(s.label)}/fire`, {
              method: "POST",
            });
            if (!r.ok) throw new Error(await r.text());
          } else {
            const r = await fetch(`/api/launchd/${encodeURIComponent(s.label)}/toggle`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled: op === "enable" }),
            });
            if (!r.ok) throw new Error(await r.text());
          }
        } else {
          if (op === "fire") {
            const r = await fetch(`/api/cloud/${s.id}/fire`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (!r.ok) throw new Error(await r.text());
          } else if (op === "delete") {
            const r = await fetch(`/api/cloud/${s.id}/delete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (!r.ok) throw new Error(await r.text());
          } else {
            const r = await fetch(`/api/cloud/${s.id}/toggle`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled: op === "enable" }),
            });
            if (!r.ok) throw new Error(await r.text());
          }
        }
        ok += 1;
      } catch (e) {
        fail += 1;
        if (errorSamples.length < 3) errorSamples.push((e as Error).message.slice(0, 80));
      }
    };

    // Cap concurrency at 4 to avoid hammering launchctl / the cloud API.
    const queue = [...selectedItems];
    const workers = Array.from({ length: Math.min(4, queue.length) }).map(async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item) await perform(item);
      }
    });
    await Promise.all(workers);

    setBatchBusy(false);
    setBatchFeedback(
      fail === 0
        ? `✓ ${op} ${ok}/${selectedItems.length}`
        : `${ok} ok, ${fail} failed — ${errorSamples.join(" | ")}`,
    );
    setTimeout(() => setBatchFeedback(null), 4000);
    if (op === "delete") clearSelection();
    refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {cloudEnabled && (
          <div className="flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:text-base ${
                  tab === t
                    ? "bg-[var(--card-hover)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {t === "all" ? "All" : t === "local" ? "Local" : "Cloud"}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 sm:flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, description, tag…"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-base placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
          />
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-base font-medium hover:bg-[var(--card-hover)] disabled:opacity-50"
          >
            {isRefreshing ? "…" : "Refresh"}
          </button>
          <button
            onClick={() => (batchMode ? exitBatch() : setBatchMode(true))}
            className={`shrink-0 rounded-lg border px-4 py-2 text-base font-medium transition-colors ${
              batchMode
                ? "border-[var(--accent)]/50 bg-[var(--accent)]/12 text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--card-hover)]"
            }`}
            title={batchMode ? "Exit batch mode" : "Enable batch mode to select multiple routines"}
          >
            {batchMode ? "Done" : "Batch update"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 fade-in">
        {statusChips.map((c) => (
          <button
            key={c.key}
            onClick={() => setStatus(c.key)}
            className={`chip ${status === c.key ? "chip-active" : ""}`}
          >
            {c.label}
            <span className="chip-count">{c.count}</span>
          </button>
        ))}
        {batchMode && (
          <button
            onClick={selectAllVisible}
            className="chip ml-auto"
            title="Select every routine matching current filters"
          >
            Select visible
          </button>
        )}
      </div>

      {batchMode && selection.size > 0 && (
        <div className="batch-bar fade-in flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/8 px-3 py-2">
          <span className="text-sm font-medium">
            <span className="text-[var(--accent)]">{selection.size}</span> selected
          </span>
          <span className="hidden text-xs text-[var(--muted)] sm:inline">
            batch actions run in parallel (up to 4 at a time)
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              disabled={batchBusy}
              onClick={() => runBatch("fire")}
              className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--card-hover)] disabled:opacity-50"
            >
              Fire
            </button>
            <button
              disabled={batchBusy}
              onClick={() => runBatch("enable")}
              className="rounded border border-[var(--green)]/40 px-3 py-1.5 text-sm font-medium text-[var(--green)] hover:bg-[var(--green)]/10 disabled:opacity-50"
            >
              Enable
            </button>
            <button
              disabled={batchBusy}
              onClick={() => runBatch("disable")}
              className="rounded border border-[var(--amber)]/40 px-3 py-1.5 text-sm font-medium text-[var(--amber)] hover:bg-[var(--amber)]/10 disabled:opacity-50"
            >
              Disable
            </button>
            {cloudEnabled &&
              selectedItems.some((s) => s.kind === "cloud") && (
                <button
                  disabled={batchBusy}
                  onClick={() =>
                    runBatch(
                      "delete",
                      `Delete ${selectedItems.filter((s) => s.kind === "cloud").length} cloud trigger(s)? This cannot be undone. (launchd items skipped.)`,
                    )
                  }
                  className="rounded border border-[var(--red)]/40 px-3 py-1.5 text-sm font-medium text-[var(--red)] hover:bg-[var(--red)]/10 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            <button
              onClick={clearSelection}
              className="rounded border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]"
            >
              Clear
            </button>
          </div>
          {batchFeedback && (
            <span
              className={`w-full text-sm ${batchFeedback.startsWith("✓") ? "text-[var(--green)]" : "text-[var(--red)]"}`}
            >
              {batchFeedback}
            </span>
          )}
        </div>
      )}

      {showLocal && (
        <Section
          title="Local · launchd"
          count={filteredAgents.length}
          error={errors.launchd}
          empty="No LaunchAgents found in ~/Library/LaunchAgents/"
        >
          {filteredAgents.map((a) => (
            <LaunchdCard
              key={a.label}
              agent={a}
              meta={metadata[`launchd:${a.label}`]}
              onChange={refresh}
              onMetaChange={refreshMetadataOnly}
              selected={selection.has(selKey({ kind: "launchd", label: a.label }))}
              onToggleSelect={
                batchMode ? () => toggle({ kind: "launchd", label: a.label }) : undefined
              }
            />
          ))}
        </Section>
      )}

      {showCloud && (
        <Section
          title="Cloud · Claude Code Remote"
          count={filteredTriggers.length}
          error={errors.cloud}
          empty="No cloud triggers."
        >
          {filteredTriggers.map((t) => (
            <CloudCard
              key={t.id}
              trigger={t}
              meta={metadata[`cloud:${t.id}`]}
              onChange={refresh}
              onMetaChange={refreshMetadataOnly}
              selected={selection.has(selKey({ kind: "cloud", id: t.id }))}
              onToggleSelect={
                batchMode ? () => toggle({ kind: "cloud", id: t.id }) : undefined
              }
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  error,
  empty,
  children,
}: {
  title: string;
  count: number;
  error: string | null;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold uppercase tracking-wider text-[var(--muted)]">
          {title}
        </h2>
        <span className="text-sm font-medium text-[var(--muted)]">{count}</span>
      </div>
      {error ? (
        <div className="rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 p-4 text-base text-[var(--red)]">
          {error}
        </div>
      ) : count === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-base text-[var(--muted)]">
          {empty}
        </div>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}
