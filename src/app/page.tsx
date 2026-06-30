import { listAgents } from "@/lib/launchd";
import { listTriggers } from "@/lib/cloud";
import { getAllMeta } from "@/lib/metadata";
import { RoutinesView } from "./_components/routines-view";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [agentsRes, triggersRes, metaRes] = await Promise.allSettled([
    listAgents(),
    listTriggers(),
    getAllMeta(),
  ]);
  const agents = agentsRes.status === "fulfilled" ? agentsRes.value : [];
  const agentsError = agentsRes.status === "rejected" ? (agentsRes.reason as Error).message : null;
  const triggers = triggersRes.status === "fulfilled" ? triggersRes.value : [];
  const triggersError = triggersRes.status === "rejected" ? (triggersRes.reason as Error).message : null;
  const metadata = metaRes.status === "fulfilled" ? metaRes.value : {};

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Routines</h1>
          <p className="mt-1 text-base text-[var(--muted)]">
            Unified view: macOS launchd · Claude Code Remote
          </p>
        </div>
        <span className="shrink-0 text-sm text-[var(--muted)]">
          {agents.length} local · {triggers.length} cloud
        </span>
      </header>
      <RoutinesView
        initialAgents={agents}
        initialTriggers={triggers}
        initialMetadata={metadata}
        initialErrors={{ launchd: agentsError, cloud: triggersError }}
      />
    </main>
  );
}
