import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import type { Conduit, Terminal } from "./app";

/** A ~/.zshenv that logs the size each interactive shell starts at. */
export const zshenv = `[[ -o interactive ]] && print -r -- "start $$ $(stty size)" >> ~/shells.log\n`;

/** The size the terminal's shell started at, which needs `zshenv`, and its size now. */
async function shellSizes(app: Conduit, terminal: Terminal) {
  expect(await terminal.run('echo "shell $$ $(stty size)"')).toBe(0);
  const text = await terminal.text();
  const [, pid, rows, columns] = text.match(/^shell (\d+) (\d+) (\d+)$/m)!;
  const log = fs.readFileSync(path.join(app.home, "shells.log"), "utf8");
  const [, startRows, startColumns] = log.match(
    new RegExp(`^start ${pid} (\\d+) (\\d+)$`, "m"),
  )!;
  // A shell that starts wider wraps its first prompt when the pane narrows
  // it, which leaves a stray `%` line.
  expect(text.split("\n").filter((row) => row.trim() === "%")).toEqual([]);
  return {
    started: { rows: Number(startRows), columns: Number(startColumns) },
    now: { rows: Number(rows), columns: Number(columns) },
  };
}

/**
 * Expects the terminal's shell to have started no wider than its pane, and its
 * screen to have no stray `%` line. Starting a column narrower while a split
 * settles is harmless.
 */
export async function expectStartedAtPaneWidth(
  app: Conduit,
  terminal: Terminal,
): Promise<void> {
  const { started, now } = await shellSizes(app, terminal);
  expect(started.columns).toBeLessThanOrEqual(now.columns);
}

/** Expects the terminal's shell to have started at exactly its pane's size. */
export async function expectStartedAtPaneSize(
  app: Conduit,
  terminal: Terminal,
): Promise<void> {
  const { started, now } = await shellSizes(app, terminal);
  expect(started).toEqual(now);
}
