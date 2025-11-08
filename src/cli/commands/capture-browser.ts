import { Command } from "commander";
import { sendCliRequest } from "../ipc";

const COMMAND_NAME = "capture-browser";

const command = new Command(COMMAND_NAME)
  .description("Capture a screenshot of a specific browser pane")
  .argument("<paneId>", "The browser pane to capture")
  .action(async (paneId: string) => {
    const { data: filePath } = await sendCliRequest({
      type: COMMAND_NAME,
      paneId,
    });

    process.stdout.write(`Screenshot saved to: ${filePath}\n`);
  });

export default command;
