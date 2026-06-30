import { NextResponse } from "next/server";
import { updateSchedule, type Schedule } from "@/lib/launchd";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ label: string }> }) {
  const { label } = await ctx.params;
  const body = (await req.json()) as { schedule: Schedule | Schedule[] };
  if (!body.schedule) {
    return NextResponse.json({ error: "schedule required" }, { status: 400 });
  }
  try {
    await updateSchedule(decodeURIComponent(label), body.schedule);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
