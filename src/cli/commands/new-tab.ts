import { Command } from "commander";
import { sendCliCommand } from "../ipc";

const COMMAND_NAME = "new-tab";

export default new Command(COMMAND_NAME)
  .alias("new")
  .description("Open a new tab.")
  .action(async () => {
    await sendCliCommand({
      name: COMMAND_NAME,
    });
  });
