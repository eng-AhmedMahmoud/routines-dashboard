import { getMeta, keyFor } from "./metadata";

export type FireEvent = {
  event: "fire";
  kind: "launchd" | "cloud";
  label: string;
  source: "dashboard" | "schedule";
  timestamp: string;
};

// Fire-and-forget POST to the routine's configured n8n webhook, if any.
// Errors are swallowed — a broken webhook must never break `launchctl start`
// or the cloud fire flow. We do log to stderr so the operator can see it.
export async function postFireEvent(
  kind: "launchd" | "cloud",
  label: string,
  source: FireEvent["source"] = "dashboard",
): Promise<void> {
  const meta = await getMeta(keyFor(kind, label));
  const url = meta?.n8n_webhook_url;
  if (!url) return;

  const payload: FireEvent = {
    event: "fire",
    kind,
    label,
    source,
    timestamp: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    console.error(`[n8n] webhook POST failed for ${kind}:${label}:`, (e as Error).message);
  } finally {
    clearTimeout(timeout);
  }
}
