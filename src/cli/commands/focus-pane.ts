import { Command } from "commander";
import { sendCliRequest } from "../ipc";

const COMMAND_NAME = "focus-pane";

const command = new Command(COMMAND_NAME)
  .alias("focus")
  .description("Toggle focus mode for the active pane.")
  .action(async () => {
    await sendCliRequest({
      type: COMMAND_NAME,
    });
  });

export default command;
