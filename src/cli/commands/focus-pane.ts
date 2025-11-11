import { Command } from "commander";
import { sendCliCommand } from "../ipc";

const COMMAND_NAME = "focus-pane";

export default new Command(COMMAND_NAME)
  .alias("focus")
  .description("Toggle focus mode for the active pane.")
  .action(async () => {
    await sendCliCommand(COMMAND_NAME);
  });
