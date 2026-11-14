import { app } from "electron";
import { readFileSync, unwatchFile, watchFile } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultSettings, type UserSettings } from "../model";

/**
 * The user's settings in `~/.conduit/settings.json`, a file that also takes
 * hand edits. It's read on first use and kept in memory. Every read and write
 * of the file runs in one queue, and a write rejects if it couldn't be written.
 * `watch` checks the file for outside edits every `watchIntervalMs`.
 */
export function openSettings(home: () => string, watchIntervalMs = 1000) {
  const filePath = () => path.join(home(), ".conduit", "settings.json");

  let current: UserSettings | undefined;

  // The file's text as we last read or wrote it. When the file still holds
  // it, nobody else has changed it, so our own writes don't count as edits.
  let lastContents: string | undefined;

  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  }

  function fromFile(contents: string): UserSettings {
    let saved: unknown;
    try {
      saved = JSON.parse(contents);
    } catch (error) {
      throw new Error(
        `settings.json doesn't parse: ${(error as Error).message}`,
      );
    }
    if (typeof saved !== "object" || saved === null || Array.isArray(saved)) {
      throw new Error("settings.json doesn't hold a JSON object");
    }
    return { ...defaultSettings, homeDirectory: home(), ...saved };
  }

  function get(): UserSettings {
    if (current) return current;

    try {
      const contents = readFileSync(filePath(), "utf-8");
      current = fromFile(contents);
      // Only a file that parsed counts as ours to overwrite.
      lastContents = contents;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[Settings] Using defaults:", error);
      }
      current = { ...defaultSettings, homeDirectory: home() };
    }
    return current;
  }

  let onExternalChange: ((settings: UserSettings) => void) | undefined;

  /**
   * Applies settings.json if someone else has changed it since we last looked.
   * A missing file changes nothing, so deleting it can't clear a setting like
   * the dotfiles repo. A file that doesn't parse throws.
   */
  async function reload(): Promise<void> {
    get();
    let contents: string;
    try {
      contents = await readFile(filePath(), "utf-8");
    } catch {
      return;
    }
    if (contents === lastContents) return;

    current = fromFile(contents);
    lastContents = contents;
    onExternalChange?.(current);
  }

  /**
   * Merges `change` into the latest settings, including any edit made on disk
   * since we last looked, and writes the result. It refuses to replace a file
   * that doesn't parse, since that would throw away the user's text.
   */
  function update(
    change: (settings: UserSettings) => Partial<UserSettings>,
  ): Promise<UserSettings> {
    return enqueue(async () => {
      await reload();
      const latest = get();
      const next = { ...latest, ...change(latest) };
      const contents = serialize(next);

      // A plain write rather than write-and-rename, because settings.json
      // may be a symlink into the dotfiles repo, and a rename would replace it.
      await writeFile(filePath(), contents, "utf-8");
      current = next;
      lastContents = contents;
      return next;
    });
  }

  /**
   * Calls `onChange` with the new settings whenever settings.json changes
   * outside the app, and returns the function that stops watching. It polls
   * the file because a watch on its directory misses edits that reach it
   * through a symlink, like a dotfiles pull.
   */
  function watch(onChange: (settings: UserSettings) => void): () => void {
    onExternalChange = onChange;
    const watched = filePath();
    const listener = () => {
      enqueue(reload).catch((error: Error) =>
        console.error("[Settings] Ignoring settings.json:", error.message),
      );
    };
    watchFile(watched, { interval: watchIntervalMs }, listener);
    return () => {
      unwatchFile(watched, listener);
      onExternalChange = undefined;
    };
  }

  return { get, update, watch };
}

/** settings.json keeps only what differs from the defaults. */
function serialize(settings: UserSettings): string {
  const saved = Object.fromEntries(
    Object.entries(settings).filter(
      ([key, value]) =>
        key !== "homeDirectory" &&
        !(Array.isArray(value) && value.length === 0) &&
        value !== defaultSettings[key as keyof typeof defaultSettings],
    ),
  );
  return JSON.stringify(saved, null, 2);
}

export const settings = openSettings(() => app.getPath("home"));
