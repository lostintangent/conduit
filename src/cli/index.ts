import { Command } from "commander";
import { CLI_COMMAND_NAME } from "../shared/cli/types";
import registerBrowserCommands from "@features/browser/cli/command";
import registerCanvasCommands from "@features/canvas/cli/command";
import registerEditorCommands from "@features/editor/cli/command";
import registerPaneCommands from "@features/workbench/cli/paneCommand";
import registerTabCommands from "@features/workbench/cli/tabCommand";
import registerTerminalCommands from "@features/terminal/cli/command";

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
