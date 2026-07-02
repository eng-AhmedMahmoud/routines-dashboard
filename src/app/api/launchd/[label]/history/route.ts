import { NextResponse } from "next/server";
import { getAgent } from "@/lib/launchd";
import { agentRunHistory } from "@/lib/history";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ label: string }> }) {
  const { label } = await ctx.params;
  try {
    const decoded = decodeURIComponent(label);
    const agent = await getAgent(decoded);
    if (!agent) {
      return NextResponse.json({ error: `agent not found: ${decoded}` }, { status: 404 });
    }
    const runs = await agentRunHistory(agent.stdoutPath, agent.stderrPath, 10);
    return NextResponse.json({ runs });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
