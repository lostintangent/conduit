import { Command } from "commander";
import { sendCliRequest } from "../ipc";

const COMMAND_NAME = "close-pane";

const command = new Command(COMMAND_NAME)
  .alias("close")
  .description("Close the active pane or tab.")
  .option("-t, --tab", "Close the active tab instead of the pane.")
  .action(async (options: { tab?: boolean }) => {
    await sendCliRequest({
      type: COMMAND_NAME,
      closeTab: Boolean(options?.tab),
    });
  });

export default command;
