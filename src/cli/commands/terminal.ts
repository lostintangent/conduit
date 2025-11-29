import { Command } from "commander";

export default function (program: Command): Command {
  program
    .cliCommand("terminal-read", async (request, sessionId) => {
      const contents = await request({ sessionId });
      process.stdout.write(contents);
    })
    .alias("read")
    .description("Read the contents of a terminal session")
    .argument("<sessionId>", "The terminal session to read");

  program
    .cliCommand(
      "terminal-write",
      async (request, sessionId, inputParts: string[], { enter }) => {
        const input = inputParts.join(" ");
        await request({ sessionId, input, enter: !!enter });
      },
    )
    .alias("write")
    .description("Send input to a terminal session")
    .argument(
      "<sessionId>",
      "The terminal session to write to (use '*' for all terminals in the tab)",
    )
    .argument("<input...>", "Input to send to the terminal")
    .option(
      "-e, --enter",
      "Simular press enter/return after sending the input",
    );

  program
    .cliCommand("notify", async (request, textParts: string[]) => {
      const text = textParts.join(" ");
      await request({ text });
    })
    .description("Display a notification with a button to show the terminal")
    .argument("<text...>", "The notification text to display");

  return program;
}
