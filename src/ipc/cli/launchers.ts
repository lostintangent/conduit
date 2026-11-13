import fs from "node:fs/promises";
import path from "node:path";
import { CLI_COMMAND_NAME } from "../../shared/cli/types";

function generateUnixLauncher(electronBinary: string, cliPath: string) {
  return `#!/bin/sh

if [ -z "$CONDUIT_SOCKET_PATH" ]; then
  echo "CONDUIT_SOCKET_PATH is not set. Please run this command inside a Conduit terminal." >&2
  exit 1
fi

ELECTRON_BIN=${JSON.stringify(electronBinary)}
CLI_ENTRY=${JSON.stringify(cliPath)}

export ELECTRON_RUN_AS_NODE=1
exec "$ELECTRON_BIN" "$CLI_ENTRY" "$@"`;
}

/**
 * Generates the launcher scripts that allow the CLI to be run from the terminal.
 *
 * @param binDir The directory where the launcher scripts should be written to.
 * @param electronBinary The path to the Electron binary for Conduit (which is used as a Node process).
 * @param cliPath The path to the Conduit CLI entry point.
 */
export async function ensureLauncherScripts(
  binDir: string,
  electronBinary: string,
  cliPath: string,
) {
  const rootPath = path.join(binDir, CLI_COMMAND_NAME);

  await fs.writeFile(rootPath, generateUnixLauncher(electronBinary, cliPath), {
    mode: 0o755,
  });
}
