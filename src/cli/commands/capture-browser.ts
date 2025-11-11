import { Command } from "commander";
import { sendCliCommand } from "../ipc";

const COMMAND_NAME = "capture-browser";

export default new Command(COMMAND_NAME)
  .alias("capture")
  .description("Capture a screenshot of a specific browser pane")
  .argument("<paneId>", "The browser pane to capture")
  .action(async (paneId: string) => {
    const filePath = await sendCliCommand<string>(COMMAND_NAME, { paneId });
    process.stdout.write(`Screenshot saved to: ${filePath}\n`);
  });
