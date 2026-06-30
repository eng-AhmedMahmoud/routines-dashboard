"use client";

import { useState } from "react";
import type { RoutineMetadata } from "@/lib/metadata";

export function MetaEditor({
  metaKey,
  initial,
  defaultName,
  onClose,
  onSaved,
}: {
  metaKey: string;
  initial?: RoutineMetadata;
  defaultName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(initial?.display_name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [tagsStr, setTagsStr] = useState((initial?.tags || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const tags = tagsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/metadata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: metaKey,
        display_name: displayName,
        description,
        tags,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || data.error) {
      setError(data.error || res.statusText);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className="border-t border-[var(--border)] bg-[var(--card-hover)] px-4 py-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        Edit display
      </div>
      <div className="flex flex-col gap-3 text-base">
        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span className="w-24 shrink-0 text-sm font-medium text-[var(--muted)]">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={defaultName}
            className="flex-1 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
          <span className="w-24 shrink-0 pt-2 text-sm font-medium text-[var(--muted)]">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this routine do?"
            rows={2}
            className="flex-1 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span className="w-24 shrink-0 text-sm font-medium text-[var(--muted)]">Tags</span>
          <input
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="linkedin, jobs, daily"
            className="flex-1 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-base"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={saving}
            onClick={save}
            className="rounded bg-[var(--blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="rounded border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--card)]"
          >
            Cancel
          </button>
          {error && <span className="text-sm text-[var(--red)]">{error}</span>}
          <span className="ml-auto text-xs text-[var(--muted)]">
            Stored in ~/.config/routines-dashboard/metadata.json
          </span>
        </div>
      </div>
    </div>
  );
}
