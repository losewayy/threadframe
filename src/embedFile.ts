import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function writeEmbedFile(target: string, html: string, localStdio: boolean): Promise<string> {
  if (!localStdio) throw new Error("embedPath writes are only allowed in local --stdio mode, never over HTTP");
  // Reject Windows device/namespace paths and alternate data streams on every platform.
  const withoutDrive = target.replace(/^[a-z]:[\\/]/i, "");
  const segments = withoutDrive.split(/[\\/]/);
  if (!target.trim() || !/\.html$/i.test(target) || /[\x00-\x1f<>:"|?*]/.test(withoutDrive)
    || /^[\\/]{2}/.test(target) || segments.some((part) => /[. ]$/.test(part) && part !== "." && part !== "..")
    || segments.some((part) => /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
    throw new Error("embedPath must be a local .html file path without device names or invalid characters");
  }
  const file = path.resolve(target);
  const existing = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (existing && !existing.isFile()) throw new Error("embedPath must point to a regular file");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, "utf8");
  return pathToFileURL(file).href;
}
