import { Command } from "commander";
import { sendCliCommand } from "../ipc";

const COMMAND_NAME = "close-pane";

export default new Command(COMMAND_NAME)
  .alias("close")
  .description("Close the active pane or tab.")
  .option("-t, --tab", "Close the active tab instead of the pane.")
  .action(async (options: { tab?: boolean }) => {
    await sendCliCommand(COMMAND_NAME, { closeTab: Boolean(options?.tab) });
  });
