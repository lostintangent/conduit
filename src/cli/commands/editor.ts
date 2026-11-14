import { Command } from "commander";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Resolves a path the way the shell that ran the CLI sees it. The terminal
 * reports the shell's $PWD as the pane's cwd, which keeps any symlinks the
 * user cd'd through, while process.cwd() resolves them. So a path inside the
 * working directory is expressed under $PWD, once $PWD is checked to still be
 * that directory, as shells check it.
 */
async function resolveFromShell(filePath: string): Promise<string> {
  const cwd = process.cwd();
  const resolved = path.resolve(cwd, filePath);
  const shellCwd = process.env.PWD;
  if (!shellCwd || shellCwd === cwd || !path.isAbsolute(shellCwd)) {
    return resolved;
  }

  const relative = path.relative(cwd, resolved);
  if (relative.split(path.sep)[0] === "..") return resolved;

  try {
    const [shell, actual] = await Promise.all([
      fs.stat(shellCwd),
      fs.stat(cwd),
    ]);
    if (shell.dev !== actual.dev || shell.ino !== actual.ino) return resolved;
  } catch {
    return resolved;
  }

  return path.join(shellCwd, relative);
}

export default function (program: Command): Command {
  program
    .cliCommand(
      "editor-open",
      async (request, filePath: string, options: { quick?: boolean }) => {
        const resolvedPath = await resolveFromShell(filePath);

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
