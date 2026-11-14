import { Command } from "commander";
import { CLI_COMMAND_NAME } from "../shared/cli/types";

// Import the cliCommand extension to commander
// that allows defining CLI command handlers
// in a fully type-safe manner.
import "./ipc";

// Each feature registers its commands from `features/<name>/cli/command.ts`.
const features = import.meta.glob<(program: Command) => Command>(
  "../features/*/cli/command.ts",
  { eager: true, import: "default" },
);

const program = new Command(CLI_COMMAND_NAME).description(
  "Interact with Conduit, from within Conduit!",
);

for (const register of Object.values(features)) {
  register(program);
}

// Execute the CLI program
program.parseAsync(process.argv).catch(({ message }) => {
  console.error(message);
  process.exit(1);
});
