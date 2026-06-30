import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const MCP_URL = "https://api.anthropic.com/v1/code/mcp/meta";

let cachedToken: { value: string; readAt: number } | null = null;
const TOKEN_TTL_MS = 60_000;

async function readAccessToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.readAt < TOKEN_TTL_MS) return cachedToken.value;
  const { stdout } = await execFileP("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"]);
  const parsed = JSON.parse(stdout.trim()) as {
    claudeAiOauth?: { accessToken?: string; expiresAt?: number };
  };
  const token = parsed.claudeAiOauth?.accessToken;
  if (!token) throw new Error("No Claude OAuth token in keychain");
  cachedToken = { value: token, readAt: Date.now() };
  return token;
}

type McpToolResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

async function callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = await readAccessToken();
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get("content-type") || "";
  let payload: { result?: McpToolResult; error?: { message?: string } };
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    const dataLine = text
      .split("\n")
      .find((l) => l.startsWith("data: "))
      ?.slice(6);
    if (!dataLine) throw new Error("MCP SSE empty");
    payload = JSON.parse(dataLine);
  } else {
    payload = await res.json();
  }
  if (payload.error) throw new Error(`MCP error: ${payload.error.message}`);
  const result = payload.result;
  if (!result || !result.content) throw new Error("MCP empty result");
  const textBlock = result.content.find((c) => c.type === "text")?.text || "";
  if (!textBlock) return [] as unknown as T;
  try {
    return JSON.parse(textBlock) as T;
  } catch {
    return textBlock as unknown as T;
  }
}

export type CloudTrigger = {
  id: string;
  name: string;
  cron_expression?: string;
  run_once_at?: string;
  enabled: boolean;
  ended_reason?: string;
  next_run_at?: string;
  created_at?: string;
  updated_at?: string;
  persistent_session_id?: string;
  job_config?: unknown;
};

export async function listTriggers(): Promise<CloudTrigger[]> {
  const all: CloudTrigger[] = [];
  let cursor: string | undefined;
  do {
    const args: Record<string, unknown> = { limit: 100 };
    if (cursor) args.cursor = cursor;
    const page = (await callTool<{ data: CloudTrigger[]; next_cursor?: string }>(
      "list_triggers",
      args
    )) as { data: CloudTrigger[]; next_cursor?: string };
    if (Array.isArray(page?.data)) all.push(...page.data);
    cursor = page?.next_cursor;
  } while (cursor);
  return all;
}

export async function fireTrigger(triggerId: string, text?: string): Promise<unknown> {
  const args: Record<string, unknown> = { trigger_id: triggerId };
  if (text) args.text = text;
  return callTool("fire_trigger", args);
}

export async function updateTrigger(
  triggerId: string,
  patch: { name?: string; cron_expression?: string; run_once_at?: string; enabled?: boolean }
): Promise<unknown> {
  return callTool("update_trigger", { trigger_id: triggerId, ...patch });
}

export async function deleteTrigger(triggerId: string): Promise<unknown> {
  return callTool("delete_trigger", { trigger_id: triggerId });
}

export async function createTrigger(input: {
  name: string;
  prompt: string;
  cron_expression?: string;
  run_once_at?: string;
  environment_id?: string;
  persistent_session_id?: string;
  create_new_session_on_fire?: boolean;
}): Promise<unknown> {
  return callTool("create_trigger", input);
}

export async function listEnvironments(): Promise<Array<{ id: string; name: string; kind?: string; state?: string }>> {
  const res = (await callTool<{ data: Array<{ id: string; name: string }> }>("list_environments", { limit: 50 })) as {
    data: Array<{ id: string; name: string }>;
  };
  return res?.data || [];
}
