import type { Command } from "commander";
import { sendCommand } from "../ipc";

export function registerGetPanesCommand(program: Command) {
  program
    .command("get-panes")
    .description("Output the panes currently available in the active Conduit session")
    .action(async () => {
      const response = await sendCommand({ type: "get-panes" });
      console.log(JSON.stringify(response.data, null, 2));
    });
}
