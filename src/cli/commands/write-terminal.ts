import { Command } from "commander";
import { sendCliRequest } from "../ipc";

const COMMAND_NAME = "write-terminal";

const command = new Command(COMMAND_NAME)
  .alias("write")
  .description("Send input to a terminal session")
  .argument("<sessionId>", "The terminal session to write to")
  .argument("<input...>", "Input to send to the terminal")
  .option("-n, --newline", "Add a newline to the end of the input")
  .action(
    async (
      sessionId: string,
      inputParts: string[],
      options: { newline: boolean },
    ) => {
      if (options.newline) {
        inputParts.push("\n");
      }

      const input = inputParts.join(" ");
      await sendCliRequest({
        type: COMMAND_NAME,
        sessionId,
        input,
      });
    },
  );

export default command;
