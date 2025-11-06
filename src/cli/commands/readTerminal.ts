import type { Command } from "commander";
import { sendCommand } from "../ipc";

export function registerReadTerminalCommand(program: Command) {
  program
    .command("read-terminal")
    .argument("<sessionId>", "The terminal session to read")
    .description("Output the raw buffer contents for a terminal session")
    .action(async (sessionId: string) => {
      const { data } = await sendCommand({
        type: "read-terminal",
        sessionId,
      });
      process.stdout.write(data);
    });
}
