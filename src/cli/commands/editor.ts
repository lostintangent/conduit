import { Command } from "commander";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export default function (program: Command): Command {
  program
    .cliCommand(
      "editor-open",
      async (request, filePath: string, options: { quick?: boolean }) => {
        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(process.cwd(), filePath);

        let stats: Stats;
        try {
          stats = await fs.stat(resolvedPath);
        } catch {
          throw new Error(`No such file or directory: ${filePath}`);
        }

        const target = stats.isDirectory()
          ? { cwd: resolvedPath, quick: options.quick }
          : {
              cwd: path.dirname(resolvedPath),
              filePath: resolvedPath,
              quick: options.quick,
            };

        await request(target);
      },
      { isDefault: true },
    )
    .alias("open")
    .description("Open a file or directory in the Conduit editor")
    .argument("<path>", "File or directory to open")
    .option(
      "-q, --quick",
      "Open in quick pane (modal dialog that closes on save)",
    );

  return program;
}
