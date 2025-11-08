import { Argument, Command } from "commander";
import { PANE_SPLIT_TARGETS, type PaneSplitTarget } from "../../shared/cli";
import { sendCliRequest } from "../ipc";

const COMMAND_NAME = "split-pane";

const command = new Command(COMMAND_NAME)
  .alias("split")
  .description("Split the active pane in the requested direction.")
  .addArgument(
    new Argument("[direction]", "Direction to split the active pane")
      .choices(PANE_SPLIT_TARGETS)
      .default("right"),
  )
  .action(async (direction: PaneSplitTarget) => {
    await sendCliRequest({
      type: COMMAND_NAME,
      direction,
    });
  });

export default command;
