import { Command } from "commander";

// Process escape sequences like \t, \n, \e, \x1b, etc.
function processEscapes(str: string): string {
  return str.replace(/\\(x[0-9a-fA-F]{2}|[ntre\\])/g, (_, seq) => {
    if (seq.startsWith("x"))
      return String.fromCharCode(parseInt(seq.slice(1), 16));
    if (seq === "n") return "\n";
    if (seq === "t") return "\t";
    if (seq === "r") return "\r";
    if (seq === "e") return "\x1b";
    if (seq === "\\") return "\\";
    return seq;
  });
}

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
        const input = processEscapes(inputParts.join(" "));
        await request({ paneId: pane, all, input, enter: !!enter });
      },
    )
    .alias("write")
    .description(
      "Send input to a terminal pane (supports \\t, \\n, \\xHH escapes)",
    )
    .argument("<input...>", "Input to send to the terminal")
    .paneOption("The ID of the pane to write to")
    .option("-a, --all", "Write to all terminals in the tab")
    .option(
      "-e, --enter",
      "Simulate pressing enter/return after sending the input",
    );

  program
    .cliCommand("terminal-wait", async (request, options) => {
      const idle = await request({
        paneId: options.pane,
        timeout: options.timeout
          ? parseFloat(options.timeout) * 1000
          : undefined,
      });
      if (!idle) process.exit(1);
    })
    .alias("wait")
    .description("Wait for a terminal pane to become idle")
    .paneOption("The ID of the pane to wait for")
    .option(
      "-t, --timeout <seconds>",
      "Maximum seconds to wait (exit 1 on timeout)",
    );

  program
    .cliCommand("notify", async (request, messageParts: string[]) => {
      const message = messageParts.join(" ") || undefined;
      await request({ message });
    })
    .description("Display a notification")
    .argument("[message...]", "The notification message to display");

  return program;
}
