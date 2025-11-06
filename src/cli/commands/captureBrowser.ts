import type { Command } from "commander";
import { sendCommand } from "../ipc";

export function registerCaptureBrowserCommand(program: Command) {
  program
    .command("capture-browser")
    .argument("<paneId>", "The browser pane to capture")
    .description("Capture a browser pane to a temporary PNG file")
    .action(async (paneId: string) => {
      const { data } = await sendCommand({
        type: "capture-browser",
        paneId,
      });

      const filePath = data?.filePath;
      if (typeof filePath !== "string") {
        throw new Error("Renderer did not return a capture file path.");
      }

      process.stdout.write(`${filePath}\n`);
    });
}
