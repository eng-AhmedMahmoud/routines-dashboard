import { NextResponse } from "next/server";
import { listTriggers } from "@/lib/cloud";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const triggers = await listTriggers();
    return NextResponse.json({ triggers });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
