import { Command } from "commander";

export default function (program: Command): Command {
  program
    .cliCommand("terminal-read", async (request, options) => {
      const contents = await request({
        paneId: options.pane,
        all: options.all,
      });
      process.stdout.write(contents);
    })
    .alias("read")
    .description("Read the contents of a terminal pane")
    .paneOption("The ID of the pane to read")
    .option("-a, --all", "Read from all terminals in the tab");

  program
    .cliCommand(
      "terminal-write",
      async (request, inputParts: string[], { pane, all, enter }) => {
        const input = inputParts.join(" ");
        await request({ paneId: pane, all, input, enter: !!enter });
      },
    )
    .alias("write")
    .description("Send input to a terminal pane")
    .argument("<input...>", "Input to send to the terminal")
    .paneOption("The ID of the pane to write to")
    .option("-a, --all", "Write to all terminals in the tab")
    .option(
      "-e, --enter",
      "Simulate pressing enter/return after sending the input",
    );

  program
    .cliCommand("notify", async (request, messageParts: string[]) => {
      const message = messageParts.join(" ");
      await request({ message });
    })
    .description("Display a notification")
    .argument("<message...>", "The notification message to display");

  return program;
}
