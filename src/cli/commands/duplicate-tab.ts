import { Command } from "commander";
import { sendCliRequest } from "../ipc";

const COMMAND_NAME = "duplicate-tab";

export default new Command(COMMAND_NAME)
  .alias("duplicate")
  .description("Duplicate the active tab.")
  .action(async () => {
    await sendCliRequest({
      type: COMMAND_NAME,
    });
  });
