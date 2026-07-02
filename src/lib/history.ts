import { readFile, stat } from "node:fs/promises";

export type RunEvent = {
  ts: string;           // ISO timestamp
  status: "ok" | "fail" | "unknown";
  exitCode: number | null;
  durationMs: number | null;
};

const MAX_TAIL_BYTES = 128 * 1024;
const RUN_MARKERS: RegExp[] = [
  /^\[([A-Za-z]{3} [A-Za-z]{3}\s+\d+ \d{2}:\d{2}:\d{2} \d{4})\] launching/,   // `date` output
  /^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}[^\]]*)\] launching/,             // ISO-ish
  /^\[([^\]]+)\] launching/,                                                    // generic wrapper
];
const EXIT_RE = /(?:exit(?:ed)?[:= ]|status[:= ])(-?\d+)/i;

function parseDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function tailFile(path: string, bytes: number): Promise<string> {
  try {
    const s = await stat(path);
    if (!s.isFile()) return "";
    const start = Math.max(0, s.size - bytes);
    // fs.readFile w/ start offset via handle
    const buf = await readFile(path);
    return buf.subarray(start).toString("utf8");
  } catch {
    return "";
  }
}

// Parse a launchd stdout log for run events. Each run is bracketed by an
// `[timestamp] launching …` marker (the convention our own run-*.sh scripts
// emit). Duration is inferred from the gap to the NEXT run marker OR to EOF.
export function parseRuns(text: string): RunEvent[] {
  const lines = text.split(/\r?\n/);
  const runs: { startIdx: number; ts: Date }[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const rx of RUN_MARKERS) {
      const m = rx.exec(lines[i]);
      if (m && m[1]) {
        const d = parseDate(m[1]);
        if (d) runs.push({ startIdx: i, ts: d });
        break;
      }
    }
  }

  const events: RunEvent[] = [];
  for (let r = 0; r < runs.length; r++) {
    const start = runs[r];
    const endIdx = r + 1 < runs.length ? runs[r + 1].startIdx : lines.length;
    const slice = lines.slice(start.startIdx, endIdx).join("\n");

    let exitCode: number | null = null;
    const m = EXIT_RE.exec(slice);
    if (m) exitCode = parseInt(m[1], 10);

    const nextTs = r + 1 < runs.length ? runs[r + 1].ts : null;
    const durationMs = nextTs ? Math.max(0, nextTs.getTime() - start.ts.getTime()) : null;

    events.push({
      ts: start.ts.toISOString(),
      status: exitCode === 0 ? "ok" : exitCode !== null ? "fail" : "unknown",
      exitCode,
      durationMs,
    });
  }
  return events;
}

export async function agentRunHistory(
  stdoutPath: string | null,
  stderrPath: string | null,
  limit = 10,
): Promise<RunEvent[]> {
  const [out, err] = await Promise.all([
    stdoutPath ? tailFile(stdoutPath, MAX_TAIL_BYTES) : Promise.resolve(""),
    stderrPath ? tailFile(stderrPath, MAX_TAIL_BYTES) : Promise.resolve(""),
  ]);
  const runs = parseRuns(out + "\n" + err);
  return runs.slice(-limit);
}
