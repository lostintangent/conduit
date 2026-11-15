import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const queues = new Map<string, Promise<unknown>>();

/**
 * Replaces a file's contents by writing a temp file next to it and renaming
 * that over it, so a crash or a failed write leaves the old file or the new
 * one, never part of either. Writes to one file land in the order they were
 * asked for. When the path is a symlink, the file it points to is replaced
 * and the symlink stays, so a settings file kept in a dotfiles repo stays
 * there.
 */
export function writeFileAtomically(
  filePath: string,
  contents: string,
): Promise<void> {
  const key = path.resolve(filePath);
  const write = (queues.get(key) ?? Promise.resolve()).then(() =>
    replace(key, contents),
  );
  const settled = write.catch(() => {});
  queues.set(key, settled);
  settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return write;
}

/** Writes `value` as indented JSON with `writeFileAtomically`. */
export function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  return writeFileAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function replace(filePath: string, contents: string) {
  const target = await followSymlinks(filePath);
  const mode = await fs.stat(target).then(
    (stats) => stats.mode & 0o777,
    () => undefined,
  );
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomBytes(6).toString("hex")}.tmp`,
  );

  try {
    const file = await fs.open(temp, "wx", mode);
    try {
      await file.writeFile(contents, "utf-8");
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

/** The path a chain of symlinks ends at, whether or not that file exists yet. */
async function followSymlinks(filePath: string): Promise<string> {
  let current = filePath;
  for (let hops = 0; hops < 32; hops++) {
    const link = await fs.readlink(current).catch(() => undefined);
    if (link === undefined) return current;
    current = path.resolve(path.dirname(current), link);
  }
  throw new Error(`Too many symlinks at ${filePath}`);
}
