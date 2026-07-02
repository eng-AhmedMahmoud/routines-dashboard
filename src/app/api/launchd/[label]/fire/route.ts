import { NextResponse } from "next/server";
import { fireAgent, watchFireOutcome } from "@/lib/launchd";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ label: string }> }) {
  const { label } = await ctx.params;
  try {
    const decoded = decodeURIComponent(label);
    await fireAgent(decoded);
    watchFireOutcome(decoded);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
