import type { Command } from "commander";
import { PANE_TYPES, PaneType } from "../../shared/cli";
import { sendCommand } from "../ipc";

function resolvePaneType(type?: string): PaneType {
  if (!type) return "all";

  const normalized = type.toLowerCase() as PaneType;
  if (PANE_TYPES.includes(normalized)) {
    return normalized;
  }

  throw new Error(
    `Invalid pane type: ${type}. Expected one of: ${PANE_TYPES.join(", ")}.`,
  );
}

export function registerListPanesCommand(program: Command) {
  program
    .command("list-panes")
    .description("List the other panes in the active Conduit tab.")
    .option(
      "-t, --type <paneType>",
      'Filter panes by type (editor|browser|terminal|all). Defaults to "all".',
    )
    .action(async (options: { type?: string }) => {
      const paneType = resolvePaneType(options.type);

      const { data } = await sendCommand({ type: "list-panes", paneType });
      console.log(JSON.stringify(data, null, 2));
    });
}
