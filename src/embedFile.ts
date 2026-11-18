import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoSymlinkComponents, resolveSafeFilePath } from "./pathSafety.js";

export async function writeEmbedFile(target: string, html: string, localStdio: boolean): Promise<string> {
  if (!localStdio) throw new Error("embedPath writes are only allowed in local --stdio mode, never over HTTP");
  const file = resolveSafeFilePath(target, ".html");
  await assertNoSymlinkComponents(file);
  const existing = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (existing && !existing.isFile()) throw new Error("embedPath must point to a regular file");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, "utf8");
  return pathToFileURL(file).href;
}
