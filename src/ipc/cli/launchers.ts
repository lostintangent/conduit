import fs from "node:fs/promises";
import path from "node:path";
import { CLI_COMMAND_NAME } from "../../shared/cli";

function buildUnixLauncher(electronBinary: string, cliPath: string) {
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

function buildCmdLauncher(electronBinary: string, cliPath: string) {
  const escape = (value: string) => value.replace(/"/g, '""');

  return [
    "@echo off",
    `if "%CONDUIT_SOCKET_PATH%"=="" (`,
    "  echo CONDUIT_SOCKET_PATH is not set. Please run this command inside a Conduit terminal.",
    "  exit /b 1",
    ")",
    `set "ELECTRON_BIN=${escape(electronBinary)}"`,
    `set "CLI_ENTRY=${escape(cliPath)}"`,
    `set "ELECTRON_RUN_AS_NODE=1"`,
    `"%ELECTRON_BIN%" "%CLI_ENTRY%" %*`,
    "exit /b %errorlevel%",
    "",
  ].join("\r\n");
}

function buildPowerShellLauncher(electronBinary: string, cliPath: string) {
  const escape = (value: string) => value.replace(/'/g, "''");

  return [
    "if (-not $env:CONDUIT_SOCKET_PATH) {",
    "  Write-Error 'CONDUIT_SOCKET_PATH is not set. Please run this command inside a Conduit terminal.'",
    "  exit 1",
    "}",
    `$electronBin = '${escape(electronBinary)}'`,
    `$cliEntry = '${escape(cliPath)}'`,
    "$env:ELECTRON_RUN_AS_NODE = '1'",
    "& $electronBin $cliEntry @Args",
    "exit $LASTEXITCODE",
    "",
  ].join("\r\n");
}

export async function ensureLauncherScripts(
  binDir: string,
  electronBinary: string,
  cliPath: string,
) {
  const rootPath = path.join(binDir, CLI_COMMAND_NAME);

  if (process.platform === "win32") {
    await fs.writeFile(
      `${rootPath}.cmd`,
      buildCmdLauncher(electronBinary, cliPath),
    );

    await fs.writeFile(
      `${rootPath}.ps1`,
      buildPowerShellLauncher(electronBinary, cliPath),
    );
  } else {
    await fs.writeFile(rootPath, buildUnixLauncher(electronBinary, cliPath), {
      mode: 0o755,
    });
  }
}
