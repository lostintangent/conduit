import { Command } from "commander";
import { registerCommands } from "./commands";

const program = new Command("conduit");

program
  .description("Interact with Conduit, from within Conduit!")
  .usage("[options] <path>")
  .showHelpAfterError("(use -h for help)");

registerCommands(program);

program.parseAsync(process.argv).catch(({ message }) => {
  console.error(message);
  process.exit(1);
});
