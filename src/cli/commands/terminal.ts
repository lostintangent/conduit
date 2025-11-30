import { Command } from "commander";

export default function (program: Command): Command {
  program
    .cliCommand("terminal-read", async (request, options) => {
      const contents = await request({ paneId: options.pane });
      process.stdout.write(contents);
    })
    .alias("read")
    .description("Read the contents of a terminal pane")
    .option(
      "-p, --pane <pane>",
      "The ID of the pane to read (use '*' to read all terminals in the tab)",
    );

  program
    .cliCommand(
      "terminal-write",
      async (request, inputParts: string[], { pane, enter }) => {
        const input = inputParts.join(" ");
        await request({ paneId: pane, input, enter: !!enter });
      },
    )
    .alias("write")
    .description("Send input to a terminal pane")
    .argument("<input...>", "Input to send to the terminal")
    .option(
      "-p, --pane <pane>",
      "The ID of the pane to write to (use '*' for all terminals in the tab)",
    )
    .option(
      "-e, --enter",
      "Simular press enter/return after sending the input",
    );

  program
    .cliCommand(
      "notify",
      async (request, messageParts: string[], { persistent }) => {
        const message = messageParts.join(" ");
        await request({ message, persistent: !!persistent });
      },
    )
    .description("Display a notification")
    .argument("<message...>", "The notification message to display")
    .option("-p, --persistent", "Don't auto-hide the notification");

  return program;
}
