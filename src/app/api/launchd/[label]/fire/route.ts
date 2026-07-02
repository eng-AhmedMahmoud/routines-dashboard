import { NextResponse } from "next/server";
import { fireAgent, watchFireOutcome } from "@/lib/launchd";
import { postFireEvent } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ label: string }> }) {
  const { label } = await ctx.params;
  try {
    const decoded = decodeURIComponent(label);
    await fireAgent(decoded);
    watchFireOutcome(decoded);
    // Fire-and-forget — no await.
    postFireEvent("launchd", decoded, "dashboard");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
