import type { Command } from "commander";
import { sendCommand } from "../ipc";

export function registerCaptureBrowserCommand(program: Command) {
  program
    .command("capture-browser")
    .argument("<paneId>", "The browser pane to capture")
    .description("Capture a screenshot of a specific browser pane")
    .action(async (paneId: string) => {
      const { data: filePath } = await sendCommand({
        type: "capture-browser",
        paneId,
      });

      process.stdout.write(`Screenshot saved to: ${filePath}\n`);
    });
}
