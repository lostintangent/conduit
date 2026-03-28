import {
  PANE_MOVE_TARGETS,
  PANE_SPLIT_TARGETS,
  PANE_SPLIT_TYPES,
  PANE_TYPES,
} from "@shared/cli/types";
import { Argument, Command, Option } from "commander";

export default function (program: Command): Command {
  program
    .cliCommand("pane-list", async (request, { type }) => {
      const panes = await request({ paneType: type });
      console.log(JSON.stringify(panes, null, 2));
    })
    .alias("list")
    .description("List the other panes in the active Conduit tab.")
    .addOption(
      new Option("-t, --type <paneType>", "Filter panes by type")
        .choices(PANE_TYPES)
        .default("all"),
    );

  program
    .cliCommand("pane-split", (request, direction, { type }) =>
      request({ direction, paneType: type }),
    )
    .alias("split")
    .description("Split the active pane in the requested direction.")
    .addArgument(
      new Argument("[direction]", "Direction to split the active pane")
        .choices(PANE_SPLIT_TARGETS)
        .default("right"),
    )
    .addOption(
      new Option("-t, --type <paneType>", "Type of pane to open")
        .choices(PANE_SPLIT_TYPES)
        .default("terminal"),
    );

  program
    .cliCommand("pane-move", (request, direction) => request({ direction }))
    .alias("move")
    .description("Move the active pane to a new location.")
    .addArgument(
      new Argument("[direction]", "Direction to move the active pane")
        .choices(PANE_MOVE_TARGETS)
        .default("tab"),
    );

  program
    .cliCommand("pane-close", (request, { closeTab, pane }) =>
      request({ closeTab: Boolean(closeTab), paneId: pane }),
    )
    .alias("close")
    .description("Close the active pane or tab.")
    .option("-t, --tab", "Close the active tab instead of the pane.")
    .paneOption("The ID of the pane to close");

  program
    .cliCommand("pane-focus")
    .alias("focus")
    .description("Toggle focus mode for the active pane.");

  return program;
}
