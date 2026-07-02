import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, writeFile, stat, copyFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const execP = promisify(exec);
const execFileP = promisify(execFile);

const AGENTS_DIR = path.join(homedir(), "Library", "LaunchAgents");

export type Schedule = {
  hour?: number;
  minute?: number;
  weekday?: number;
  day?: number;
  month?: number;
};

export type LaunchdAgent = {
  label: string;
  plistPath: string;
  programArguments: string[];
  schedule: Schedule | Schedule[] | null;
  startInterval: number | null;
  runAtLoad: boolean;
  stdoutPath: string | null;
  stderrPath: string | null;
  enabled: boolean;
  pid: number | null;
  lastExitStatus: number | null;
};

async function plutilToJson(filePath: string): Promise<Record<string, unknown>> {
  const { stdout } = await execFileP("plutil", ["-convert", "json", "-o", "-", filePath]);
  return JSON.parse(stdout);
}

async function launchctlList(label: string): Promise<{ pid: number | null; lastExitStatus: number | null }> {
  try {
    const { stdout } = await execFileP("launchctl", ["list", label]);
    const pidMatch = stdout.match(/"PID"\s*=\s*(\d+);/);
    const exitMatch = stdout.match(/"LastExitStatus"\s*=\s*(-?\d+);/);
    return {
      pid: pidMatch ? parseInt(pidMatch[1], 10) : null,
      lastExitStatus: exitMatch ? parseInt(exitMatch[1], 10) : null,
    };
  } catch {
    return { pid: null, lastExitStatus: null };
  }
}

async function isLoaded(label: string): Promise<boolean> {
  try {
    const { stdout } = await execP(`launchctl list | grep -F ${JSON.stringify(label)}`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function pickSchedule(p: Record<string, unknown>): Schedule | Schedule[] | null {
  const v = p.StartCalendarInterval;
  if (!v) return null;
  const norm = (o: Record<string, unknown>): Schedule => ({
    hour: typeof o.Hour === "number" ? o.Hour : undefined,
    minute: typeof o.Minute === "number" ? o.Minute : undefined,
    weekday: typeof o.Weekday === "number" ? o.Weekday : undefined,
    day: typeof o.Day === "number" ? o.Day : undefined,
    month: typeof o.Month === "number" ? o.Month : undefined,
  });
  return Array.isArray(v) ? (v as Record<string, unknown>[]).map(norm) : norm(v as Record<string, unknown>);
}

export async function listAgents(): Promise<LaunchdAgent[]> {
  const entries = await readdir(AGENTS_DIR);
  const plists = entries.filter((f) => f.endsWith(".plist"));
  const out: LaunchdAgent[] = [];
  for (const f of plists) {
    const plistPath = path.join(AGENTS_DIR, f);
    try {
      const p = await plutilToJson(plistPath);
      const label = typeof p.Label === "string" ? p.Label : f.replace(/\.plist$/, "");
      const [loaded, info] = await Promise.all([isLoaded(label), launchctlList(label)]);
      out.push({
        label,
        plistPath,
        programArguments: Array.isArray(p.ProgramArguments) ? (p.ProgramArguments as string[]) : [],
        schedule: pickSchedule(p),
        startInterval: typeof p.StartInterval === "number" ? p.StartInterval : null,
        runAtLoad: p.RunAtLoad === true,
        stdoutPath: typeof p.StandardOutPath === "string" ? p.StandardOutPath : null,
        stderrPath: typeof p.StandardErrorPath === "string" ? p.StandardErrorPath : null,
        enabled: loaded,
        pid: info.pid,
        lastExitStatus: info.lastExitStatus,
      });
    } catch (err) {
      out.push({
        label: f.replace(/\.plist$/, ""),
        plistPath,
        programArguments: [],
        schedule: null,
        startInterval: null,
        runAtLoad: false,
        stdoutPath: null,
        stderrPath: null,
        enabled: false,
        pid: null,
        lastExitStatus: null,
      });
    }
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export async function getAgent(label: string): Promise<LaunchdAgent | null> {
  const list = await listAgents();
  return list.find((a) => a.label === label) ?? null;
}

export async function fireAgent(label: string): Promise<void> {
  await execFileP("launchctl", ["start", label]);
}

async function osNotify(title: string, message: string): Promise<void> {
  try {
    const safeTitle = title.replace(/["\\]/g, "");
    const safeMsg = message.replace(/["\\]/g, "");
    await execFileP("osascript", [
      "-e",
      `display notification "${safeMsg}" with title "${safeTitle}" sound name "Basso"`,
    ]);
  } catch {
    // silent
  }
}

// Poll launchctl list for a fired agent for up to `timeoutMs`. Fires a macOS
// notification if the agent exits non-zero. Non-blocking (fire-and-forget).
export function watchFireOutcome(label: string, timeoutMs = 60_000): void {
  const start = Date.now();
  const intervalMs = 2_000;
  let lastPid: number | null = null;

  const tick = async () => {
    const info = await launchctlList(label);
    if (info.pid !== null) lastPid = info.pid;

    // Post-run: pid gone, we've seen an exit status
    if (info.pid === null && info.lastExitStatus !== null && info.lastExitStatus !== 0 && lastPid !== null) {
      await osNotify(`Routine failed: ${label}`, `Exited ${info.lastExitStatus}`);
      return;
    }

    if (Date.now() - start >= timeoutMs) return;
    setTimeout(tick, intervalMs);
  };

  setTimeout(tick, intervalMs);
}

export async function setEnabled(label: string, enabled: boolean): Promise<void> {
  const agent = await getAgent(label);
  if (!agent) throw new Error(`agent not found: ${label}`);
  const cmd = enabled ? "load" : "unload";
  await execFileP("launchctl", [cmd, agent.plistPath]);
}

function buildScheduleXml(s: Schedule): string {
  const lines = ["<dict>"];
  if (s.hour !== undefined) lines.push(`  <key>Hour</key><integer>${s.hour}</integer>`);
  if (s.minute !== undefined) lines.push(`  <key>Minute</key><integer>${s.minute}</integer>`);
  if (s.weekday !== undefined) lines.push(`  <key>Weekday</key><integer>${s.weekday}</integer>`);
  if (s.day !== undefined) lines.push(`  <key>Day</key><integer>${s.day}</integer>`);
  if (s.month !== undefined) lines.push(`  <key>Month</key><integer>${s.month}</integer>`);
  lines.push("</dict>");
  return lines.join("\n");
}

export async function updateSchedule(label: string, schedule: Schedule | Schedule[]): Promise<void> {
  const agent = await getAgent(label);
  if (!agent) throw new Error(`agent not found: ${label}`);
  const xml = await readFile(agent.plistPath, "utf8");
  const block = Array.isArray(schedule)
    ? `<array>\n${schedule.map(buildScheduleXml).join("\n")}\n</array>`
    : buildScheduleXml(schedule);
  let next: string;
  const re = /<key>StartCalendarInterval<\/key>\s*(<dict>[\s\S]*?<\/dict>|<array>[\s\S]*?<\/array>)/;
  if (re.test(xml)) {
    next = xml.replace(re, `<key>StartCalendarInterval</key>\n    ${block}`);
  } else {
    next = xml.replace(/<\/dict>\s*<\/plist>/, `  <key>StartCalendarInterval</key>\n    ${block}\n</dict>\n</plist>`);
  }
  const bak = `${agent.plistPath}.bak`;
  await copyFile(agent.plistPath, bak);
  const tmp = `${agent.plistPath}.tmp`;
  await writeFile(tmp, next, "utf8");
  try {
    await execFileP("plutil", ["-lint", tmp]);
  } catch (e) {
    throw new Error(`plist lint failed: ${(e as Error).message}`);
  }
  await rename(tmp, agent.plistPath);
  if (agent.enabled) {
    try {
      await execFileP("launchctl", ["unload", agent.plistPath]);
    } catch {}
    await execFileP("launchctl", ["load", agent.plistPath]);
  }
}

export async function tailLog(filePath: string, lines = 200): Promise<string> {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return "";
  } catch {
    return "";
  }
  const { stdout } = await execFileP("tail", ["-n", String(lines), filePath]);
  return stdout;
}
