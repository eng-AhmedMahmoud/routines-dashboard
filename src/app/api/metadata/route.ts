import { NextResponse } from "next/server";
import { getAllMeta, setMeta } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await getAllMeta();
  return NextResponse.json({ items });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    key?: string;
    display_name?: string;
    description?: string;
    tags?: string[];
  };
  if (!body.key) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }
  await setMeta(body.key, {
    display_name: body.display_name,
    description: body.description,
    tags: body.tags,
  });
  return NextResponse.json({ ok: true });
}
