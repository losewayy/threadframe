import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { ThreadFrameSnapshot } from "./runtime/summary.js";
import { assertNoSymlinkComponents, resolveSafeFilePath } from "./pathSafety.js";

export const SNAPSHOT_LIMIT = 128 * 1024;

export const SnapshotSchema = z.object({
  title: z.string(),
  savedAt: z.string(),
  variables: z.array(z.object({
    id: z.string(),
    label: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    changed: z.boolean(),
  })),
  choices: z.array(z.string()),
  checklist: z.object({
    done: z.number().int().min(0),
    total: z.number().int().min(0),
    items: z.array(z.object({ label: z.string(), checked: z.boolean() })),
  }),
});

async function statOrNull(file: string) {
  return fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
}

/** Writes a compact JSON snapshot to an explicitly chosen local path. */
export async function writeSnapshot(target: string, snapshot: ThreadFrameSnapshot): Promise<string> {
  const file = resolveSafeFilePath(target, ".json");
  await assertNoSymlinkComponents(file);
  const existing = await statOrNull(file);
  if (existing && !existing.isFile()) throw new Error("statePath must point to a regular file");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return pathToFileURL(file).href;
}

/** Reads one previously confirmed snapshot; never writes or creates files. */
export async function readSnapshot(target: string): Promise<unknown> {
  const file = resolveSafeFilePath(target, ".json");
  await assertNoSymlinkComponents(file);
  const stats = await statOrNull(file);
  if (!stats?.isFile()) throw new Error("statePath must point to an existing snapshot file");
  if (stats.size > SNAPSHOT_LIMIT) throw new Error("Snapshot is too large");
  const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
  if (!parsed || typeof parsed !== "object") throw new Error("Snapshot must contain a JSON object");
  return parsed;
}
