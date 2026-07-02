import { request as httpsRequest } from "node:https";
import { Agent } from "node:https";
import { getMeta, keyFor } from "./metadata";

export type FireEvent = {
  event: "fire";
  kind: "launchd" | "cloud";
  label: string;
  source: "dashboard" | "schedule";
  timestamp: string;
};

// Hosts allowed to skip TLS verification, comma-separated. Meant for the
// operator's own n8n instance that's serving a mismatched cert
// (e.g. Hostinger's `n8n.srvXXXX.hstgr.cloud` where the wildcard SAN
// covers only the VPS root). Anything not in this list uses the platform
// trust store as normal.
//
// Example: N8N_INSECURE_HOSTS=n8n.srv1092493.hstgr.cloud,n8n.internal
function insecureHostSet(): Set<string> {
  const raw = process.env.N8N_INSECURE_HOSTS || "";
  return new Set(
    raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

// Single reusable agent — creating one per request would leak sockets.
let insecureAgent: Agent | null = null;
function getInsecureAgent(): Agent {
  if (!insecureAgent) {
    insecureAgent = new Agent({ rejectUnauthorized: false, keepAlive: false });
  }
  return insecureAgent;
}

// Node's global fetch has no per-host TLS override. For URLs in the
// insecure allowlist, drop to https.request with a permissive agent so
// only those hosts skip verification — everything else still validates.
async function postInsecure(url: URL, body: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body).toString(),
        },
        agent: getInsecureAgent(),
        timeout: 5000,
      },
      (res) => {
        // Drain — we don't need the body, but leaving the stream open
        // holds the socket.
        res.on("data", () => {});
        res.on("end", () => resolve());
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

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
  const body = JSON.stringify(payload);

  try {
    const parsed = new URL(url);
    const insecureHosts = insecureHostSet();
    if (parsed.protocol === "https:" && insecureHosts.has(parsed.hostname.toLowerCase())) {
      await postInsecure(parsed, body);
      return;
    }
    // Default path — respects platform CA store.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    console.error(`[n8n] webhook POST failed for ${kind}:${label}:`, (e as Error).message);
  }
}
