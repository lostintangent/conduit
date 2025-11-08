import { Command } from "commander";
import { sendCliRequest } from "../ipc";

const COMMAND_NAME = "read-terminal";

const command = new Command(COMMAND_NAME)
  .alias("read")
  .description("Read the contents of a terminal session")
  .argument("<sessionId>", "The terminal session to read")
  .action(async (sessionId: string) => {
    const { data } = await sendCliRequest({
      type: COMMAND_NAME,
      sessionId,
    });
    process.stdout.write(data);
  });

export default command;
