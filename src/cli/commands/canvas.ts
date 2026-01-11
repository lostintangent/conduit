import { Command } from "commander";

export default function (program: Command): Command {
  program
    .cliCommand("canvas-capture", async (request, options) => {
      const filePath = await request({ paneId: options.pane });
      process.stdout.write(`Screenshot saved to: ${filePath}\n`);
    })
    .description("Capture a screenshot of a canvas pane")
    .paneOption("The ID of the canvas pane to capture");

  return program;
}
