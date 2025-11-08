import type { Command } from "commander";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { sendCommand } from "../ipc";

type ResolvedFilePath = {
  cwd: string;
  filePath: string | null;
};

async function resolvePath(rawPath: string): Promise<ResolvedFilePath> {
  const resolved = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);

  let stats: Stats;
  try {
    stats = await fs.stat(resolved);
  } catch {
    throw new Error(`No such file or directory: ${rawPath}`);
  }

  if (stats.isDirectory()) {
    return { cwd: resolved, filePath: null };
  }

  return { cwd: path.dirname(resolved), filePath: resolved };
}

async function handleOpenFile(rawPath: string) {
  const resolvedTarget = await resolvePath(rawPath);
  await sendCommand({
    type: "open-file",
    ...resolvedTarget,
  });
}

export function registerOpenFileCommands(program: Command) {
  program
    .argument("<path>", "File or directory to open in Conduit")
    .action(handleOpenFile);

  program
    .command("open-file")
    .argument("<path>", "File or directory to open")
    .description("Open a file or directory in the Conduit editor")
    .action(handleOpenFile);
}
