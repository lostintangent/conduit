import { Argument, Command } from "commander";
import { PANE_MOVE_TARGETS, type PaneMoveTarget } from "../../shared/cli/types";
import { sendCliCommand } from "../ipc";

const COMMAND_NAME = "move-pane";

export default new Command(COMMAND_NAME)
  .alias("move")
  .description("Move the active pane to a new location.")
  .addArgument(
    new Argument("[direction]", "Direction to move the active pane")
      .choices(PANE_MOVE_TARGETS)
      .default("tab"),
  )
  .action(async (direction: PaneMoveTarget) => {
    await sendCliCommand(COMMAND_NAME, { direction });
  });
