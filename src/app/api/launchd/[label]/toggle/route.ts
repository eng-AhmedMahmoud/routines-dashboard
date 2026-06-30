import { NextResponse } from "next/server";
import { setEnabled } from "@/lib/launchd";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ label: string }> }) {
  const { label } = await ctx.params;
  const body = (await req.json()) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }
  try {
    await setEnabled(decodeURIComponent(label), body.enabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
