import { NextResponse } from "next/server";
import { fireTrigger } from "@/lib/cloud";
import { postFireEvent } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  try {
    const result = await fireTrigger(id, body.text);
    postFireEvent("cloud", id, "dashboard");
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
