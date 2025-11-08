import { Command } from "commander";
import captureBrowser from "./commands/capture-browser";
import listPanes from "./commands/list-panes";
import movePane from "./commands/move-pane";
import openFile from "./commands/open-file";
import readTerminal from "./commands/read-terminal";
import writeTerminal from "./commands/write-terminal";

const program = new Command("conduit")
  .description("Interact with Conduit, from within Conduit!")
  .usage("[options] <path>")
  .showHelpAfterError("(use -h for help)");

program.addCommand(openFile, { isDefault: true });
program.addCommand(listPanes);
program.addCommand(movePane);
program.addCommand(captureBrowser);
program.addCommand(readTerminal);
program.addCommand(writeTerminal);

program.parseAsync(process.argv).catch(({ message }) => {
  console.error(message);
  process.exit(1);
});
