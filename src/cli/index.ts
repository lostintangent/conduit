import { Command } from "commander";
import { CLI_COMMAND_NAME } from "../shared/cli/types";
import registerBrowserCommands from "./commands/browser";
import registerCanvasCommands from "./commands/canvas";
import registerEditorCommands from "./commands/editor";
import registerPaneCommands from "./commands/pane";
import registerTabCommands from "./commands/tab";
import registerTerminalCommands from "./commands/terminal";

// Import the cliCommand extension to commander
// that allows defining CLI command handlers
// in a fully type-safe manner.
import "./ipc";

const program = new Command(CLI_COMMAND_NAME).description(
  "Interact with Conduit, from within Conduit!",
);

// Register the core workbench commands
registerPaneCommands(program);
registerTabCommands(program);

// Register the pane-specific commands
registerTerminalCommands(program);
registerEditorCommands(program);
registerBrowserCommands(program);
registerCanvasCommands(program);

// Execute the CLI program
program.parseAsync(process.argv).catch(({ message }) => {
  console.error(message);
  process.exit(1);
});
