import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type RoutineMetadata = {
  display_name?: string;
  description?: string;
  tags?: string[];
};

export type MetadataStore = {
  version: 1;
  items: Record<string, RoutineMetadata>;
};

const FILE = path.join(homedir(), ".config", "routines-dashboard", "metadata.json");

let memCache: MetadataStore | null = null;
let memCacheAt = 0;
const TTL_MS = 2000;

async function ensureDir() {
  await mkdir(path.dirname(FILE), { recursive: true });
}

export async function readStore(): Promise<MetadataStore> {
  if (memCache && Date.now() - memCacheAt < TTL_MS) return memCache;
  try {
    const txt = await readFile(FILE, "utf8");
    const parsed = JSON.parse(txt) as MetadataStore;
    if (parsed.version !== 1 || !parsed.items) throw new Error("schema");
    memCache = parsed;
  } catch {
    memCache = { version: 1, items: {} };
  }
  memCacheAt = Date.now();
  return memCache;
}

async function writeStore(store: MetadataStore): Promise<void> {
  await ensureDir();
  await writeFile(FILE, JSON.stringify(store, null, 2), "utf8");
  memCache = store;
  memCacheAt = Date.now();
}

export function keyFor(kind: "launchd" | "cloud", id: string): string {
  return `${kind}:${id}`;
}

export async function getMeta(key: string): Promise<RoutineMetadata | undefined> {
  const store = await readStore();
  return store.items[key];
}

export async function getAllMeta(): Promise<Record<string, RoutineMetadata>> {
  const store = await readStore();
  return store.items;
}

export async function setMeta(key: string, meta: RoutineMetadata): Promise<void> {
  const store = await readStore();
  const clean: RoutineMetadata = {};
  if (meta.display_name?.trim()) clean.display_name = meta.display_name.trim();
  if (meta.description?.trim()) clean.description = meta.description.trim();
  if (meta.tags?.length) clean.tags = meta.tags;
  if (Object.keys(clean).length === 0) {
    delete store.items[key];
  } else {
    store.items[key] = clean;
  }
  await writeStore(store);
}

export async function seedDefaults(defaults: Record<string, RoutineMetadata>): Promise<{ added: number }> {
  const store = await readStore();
  let added = 0;
  for (const [key, meta] of Object.entries(defaults)) {
    if (!store.items[key]) {
      store.items[key] = meta;
      added++;
    }
  }
  if (added > 0) await writeStore(store);
  return { added };
}
