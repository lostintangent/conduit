import { Command } from "commander";
import { sendCliCommand } from "../ipc";

const COMMAND_NAME = "duplicate-tab";

export default new Command(COMMAND_NAME)
  .alias("duplicate")
  .description("Duplicate the active tab.")
  .action(async () => {
    await sendCliCommand({
      name: COMMAND_NAME,
    });
  });
