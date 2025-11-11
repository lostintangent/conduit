import { Command } from "commander";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { sendCliCommand } from "../ipc";

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

const COMMAND_NAME = "open-file";

export default new Command(COMMAND_NAME)
  .alias("open")
  .description("Open a file or directory in the Conduit editor")
  .argument("<path>", "File or directory to open")
  .action(async (path: string) => {
    const resolvedPath = await resolvePath(path);
    await sendCliCommand({
      name: COMMAND_NAME,
      ...resolvedPath,
    });
  });
