"use client";

import { useState, useTransition } from "react";
import type { LaunchdAgent } from "@/lib/launchd";
import type { CloudTrigger } from "@/lib/cloud";
import type { RoutineMetadata } from "@/lib/metadata";
import { LaunchdCard } from "./launchd-card";
import { CloudCard } from "./cloud-card";

type Tab = "all" | "local" | "cloud";

export function RoutinesView({
  initialAgents,
  initialTriggers,
  initialMetadata,
  initialErrors,
}: {
  initialAgents: LaunchdAgent[];
  initialTriggers: CloudTrigger[];
  initialMetadata: Record<string, RoutineMetadata>;
  initialErrors: { launchd: string | null; cloud: string | null };
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [triggers, setTriggers] = useState(initialTriggers);
  const [metadata, setMetadata] = useState(initialMetadata);
  const [errors, setErrors] = useState(initialErrors);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [isRefreshing, startRefresh] = useTransition();

  const refresh = () => {
    startRefresh(async () => {
      const [agentsRes, triggersRes, metaRes] = await Promise.all([
        fetch("/api/launchd/list", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/cloud/list", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/metadata", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (agentsRes.agents) setAgents(agentsRes.agents);
      if (triggersRes.triggers) setTriggers(triggersRes.triggers);
      if (metaRes.items) setMetadata(metaRes.items);
      setErrors({
        launchd: agentsRes.error || null,
        cloud: triggersRes.error || null,
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

  const filteredAgents = agents.filter((a) =>
    matchesQuery(a.label, metadata[`launchd:${a.label}`])
  );
  const filteredTriggers = triggers.filter(
    (t) =>
      matchesQuery(t.name, metadata[`cloud:${t.id}`]) ||
      t.id.toLowerCase().includes(q) ||
      (t.cron_expression || "").toLowerCase().includes(q)
  );

  const showLocal = tab !== "cloud";
  const showCloud = tab !== "local";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1">
          {(["all", "local", "cloud"] as Tab[]).map((t) => (
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
        <div className="flex gap-2 sm:flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, description, tag…"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-base placeholder:text-[var(--muted)] focus:border-[var(--blue)] focus:outline-none"
          />
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-base font-medium hover:bg-[var(--card-hover)] disabled:opacity-50"
          >
            {isRefreshing ? "…" : "Refresh"}
          </button>
        </div>
      </div>

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
