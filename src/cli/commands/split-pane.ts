import { Argument, Command } from "commander";
import {
  PANE_SPLIT_TARGETS,
  type PaneSplitTarget,
} from "../../shared/cli/types";
import { sendCliCommand } from "../ipc";

const COMMAND_NAME = "split-pane";

export default new Command(COMMAND_NAME)
  .alias("split")
  .description("Split the active pane in the requested direction.")
  .addArgument(
    new Argument("[direction]", "Direction to split the active pane")
      .choices(PANE_SPLIT_TARGETS)
      .default("right"),
  )
  .action(async (direction: PaneSplitTarget) => {
    await sendCliCommand({
      name: COMMAND_NAME,
      direction,
    });
  });
