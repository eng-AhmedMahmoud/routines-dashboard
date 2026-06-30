"use client";

import { useEffect, useRef, useState } from "react";

export function LogPanel({ label, stderr }: { label: string; stderr: boolean }) {
  const [which, setWhich] = useState<"stdout" | "stderr">(stderr ? "stderr" : "stdout");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setText("");
    setStatus("connecting");
    const url = `/api/launchd/${encodeURIComponent(label)}/logs?stream=1&which=${which}`;
    const es = new EventSource(url);
    es.onopen = () => setStatus("live");
    es.onmessage = (ev) => {
      const chunk = ev.data.replace(/\\n/g, "\n");
      setText((prev) => {
        const next = prev + chunk;
        return next.length > 80_000 ? next.slice(-80_000) : next;
      });
    };
    es.onerror = () => {
      setStatus("error");
      es.close();
    };
    return () => es.close();
  }, [label, which]);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [text]);

  return (
    <div className="border-t border-[var(--border)] bg-black/30">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2 text-xs">
        <button
          onClick={() => setWhich("stdout")}
          className={`rounded px-2 py-0.5 ${
            which === "stdout" ? "bg-[var(--blue)]/20 text-[var(--blue)]" : "text-[var(--muted)]"
          }`}
        >
          stdout
        </button>
        <button
          onClick={() => setWhich("stderr")}
          className={`rounded px-2 py-0.5 ${
            which === "stderr" ? "bg-[var(--red)]/20 text-[var(--red)]" : "text-[var(--muted)]"
          }`}
        >
          stderr
        </button>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--muted)]">
          {status}
        </span>
      </div>
      <pre
        ref={preRef}
        className="max-h-80 overflow-auto p-4 text-[11px] leading-relaxed text-[var(--text)]"
      >
        {text || "(no output yet)"}
      </pre>
    </div>
  );
}
