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

const program = new Command("conduit").description(
  "Interact with Conduit, from within Conduit!",
);

program
  .addCommand(openFile, { isDefault: true })
  .addCommand(listPanes)
  .addCommand(splitPane)
  .addCommand(movePane)
  .addCommand(focusPane)
  .addCommand(closePane)
  .addCommand(readTerminal)
  .addCommand(writeTerminal)
  .addCommand(captureBrowser);

program.parseAsync(process.argv).catch(({ message }) => {
  console.error(message);
  process.exit(1);
});
