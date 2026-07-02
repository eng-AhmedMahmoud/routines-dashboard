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
    detailed_description?: string;
    tags?: string[];
    n8n_webhook_url?: string;
  };
  if (!body.key) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }
  await setMeta(body.key, {
    display_name: body.display_name,
    description: body.description,
    detailed_description: body.detailed_description,
    tags: body.tags,
    n8n_webhook_url: body.n8n_webhook_url,
  });
  return NextResponse.json({ ok: true });
}
