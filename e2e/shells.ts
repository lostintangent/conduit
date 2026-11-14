import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import type { Conduit, Terminal } from "./app";

/** A ~/.zshenv that logs the size each interactive shell starts at. */
export const zshenv = `[[ -o interactive ]] && print -r -- "start $$ $(stty size)" >> ~/shells.log\n`;

/**
 * Expects the terminal's shell, which must have started with `zshenv`, to have
 * started no wider than its pane, and its screen to have no stray `%` line. A
 * shell that starts wider wraps its first prompt when the pane narrows it,
 * which leaves that line. Starting a column narrower while a split settles is
 * harmless.
 */
export async function expectStartedAtPaneWidth(
  app: Conduit,
  terminal: Terminal,
): Promise<void> {
  expect(await terminal.run('echo "shell $$ $(stty size)"')).toBe(0);
  const text = await terminal.text();
  const [, pid, columns] = text.match(/^shell (\d+) \d+ (\d+)$/m)!;
  const log = fs.readFileSync(path.join(app.home, "shells.log"), "utf8");
  const started = log.match(new RegExp(`^start ${pid} \\d+ (\\d+)$`, "m"))![1];
  expect(Number(started)).toBeLessThanOrEqual(Number(columns));
  expect(text.split("\n").filter((row) => row.trim() === "%")).toEqual([]);
}
