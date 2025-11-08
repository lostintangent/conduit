import { Command } from "commander";
import captureBrowser from "./commands/capture-browser";
import closePane from "./commands/close-pane";
import focusPane from "./commands/focus-pane";
import listPanes from "./commands/list-panes";
import movePane from "./commands/move-pane";
import openFile from "./commands/open-file";
import readTerminal from "./commands/read-terminal";
import splitPane from "./commands/split-pane";
import writeTerminal from "./commands/write-terminal";

const program = new Command("conduit")
  .description("Interact with Conduit, from within Conduit!")
  .usage("[options] <path>")
  .showHelpAfterError("(use -h for help)");

program.addCommand(openFile, { isDefault: true });
program.addCommand(listPanes);
program.addCommand(movePane);
program.addCommand(focusPane);
program.addCommand(closePane);
program.addCommand(splitPane);
program.addCommand(captureBrowser);
program.addCommand(readTerminal);
program.addCommand(writeTerminal);

program.parseAsync(process.argv).catch(({ message }) => {
  console.error(message);
  process.exit(1);
});
