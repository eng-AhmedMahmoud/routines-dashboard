import { getAgent, tailLog } from "@/lib/launchd";
import { spawn } from "node:child_process";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ label: string }> }) {
  const { label } = await ctx.params;
  const url = new URL(req.url);
  const stream = url.searchParams.get("stream") === "1";
  const which = (url.searchParams.get("which") || "stdout") === "stderr" ? "stderr" : "stdout";

  const agent = await getAgent(decodeURIComponent(label));
  if (!agent) {
    return new Response(JSON.stringify({ error: "agent not found" }), { status: 404 });
  }
  const file = which === "stderr" ? agent.stderrPath : agent.stdoutPath;
  if (!file) {
    return new Response(JSON.stringify({ error: `no ${which} path configured` }), { status: 404 });
  }

  if (!stream) {
    const text = await tailLog(file, 500);
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const initial = await tailLog(file, 200);
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(`data: ${chunk.replace(/\n/g, "\\n")}\n\n`));
      };
      if (initial) send(initial);
      const child = spawn("tail", ["-F", "-n", "0", file]);
      child.stdout.on("data", (d) => send(d.toString()));
      child.stderr.on("data", (d) => send(`[tail-err] ${d.toString()}`));
      const close = () => {
        try {
          child.kill();
        } catch {}
        try {
          controller.close();
        } catch {}
      };
      child.on("exit", close);
      req.signal.addEventListener("abort", close);
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
