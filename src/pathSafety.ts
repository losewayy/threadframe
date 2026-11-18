import fs from "node:fs/promises";
import path from "node:path";

const DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;

/**
 * Validates a caller-supplied local artifact path (HTML export or JSON snapshot).
 * Rejects device names, ADS colons, UNC paths, trailing dots/spaces and wrong suffixes.
 */
export function resolveSafeFilePath(target: string, extension: ".html" | ".json"): string {
  const withoutDrive = target.replace(/^[a-z]:[\\/]/i, "");
  const segments = withoutDrive.split(/[\\/]/);
  if (!target.trim() || path.extname(target).toLowerCase() !== extension
    || /[\x00-\x1f<>:"|?*]/.test(withoutDrive)
    || /^[\\/]{2}/.test(target)
    || segments.some((part) => /[. ]$/.test(part) && part !== "." && part !== "..")
    || segments.some((part) => DEVICE_NAMES.test(part))) {
    throw new Error(`Path must be a local ${extension} file without device names or invalid characters`);
  }
  return path.resolve(target);
}

/** Rejects symbolic links anywhere on the path so a validated name cannot escape through a link. */
export async function assertNoSymlinkComponents(file: string): Promise<void> {
  let current = file;
  for (;;) {
    const stats = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stats?.isSymbolicLink()) throw new Error("Path must not traverse symbolic links");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
