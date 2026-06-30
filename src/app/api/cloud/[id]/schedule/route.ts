import { NextResponse } from "next/server";
import { updateTrigger } from "@/lib/cloud";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { cron_expression?: string; run_once_at?: string; name?: string };
  try {
    await updateTrigger(id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
