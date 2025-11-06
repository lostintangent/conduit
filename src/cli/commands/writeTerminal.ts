import type { Command } from "commander";
import { sendCommand } from "../ipc";

type WriteTerminalOptions = {
  appendNewline?: boolean;
};

export function registerWriteTerminalCommand(program: Command) {
  program
    .command("write-terminal")
    .argument("<sessionId>", "The terminal session to write to")
    .argument("<input...>", "Text to send to the terminal (joined with spaces)")
    .description("Send input to a terminal session")
    .option("--append-newline", "Append a newline if one is not present")
    .action(
      async (
        sessionId: string,
        inputParts: string[],
        options: WriteTerminalOptions,
      ) => {
        if (inputParts.length === 0) {
          throw new Error("No input provided for write-terminal command.");
        }

        let input = inputParts.join(" ");

        if (options.appendNewline && !input.endsWith("\n")) {
          input += "\n";
        }

        await sendCommand({
          type: "write-terminal",
          sessionId,
          input,
        });
      },
    );
}
