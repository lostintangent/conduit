import { Command } from "commander";
import { sendCliCommand } from "../ipc";

const COMMAND_NAME = "read-terminal";

export default new Command(COMMAND_NAME)
  .alias("read")
  .description("Read the contents of a terminal session")
  .argument("<sessionId>", "The terminal session to read")
  .action(async (sessionId: string) => {
    const contents = await sendCliCommand<string>(COMMAND_NAME, { sessionId });
    process.stdout.write(contents);
  });
