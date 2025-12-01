import { Command } from "commander";

export default function (program: Command): Command {
  program
    .cliCommand("tab-new", (request, { title, command }) =>
      request({ title, command }),
    )
    .alias("new")
    .description("Open a new tab.")
    .option("-t, --title <title>", "Title for the new tab")
    .option("-c, --command <command>", "Command to run in the new tab");

  program
    .cliCommand("tab-duplicate")
    .alias("duplicate")
    .description("Duplicate the active tab.");

  program
    .cliCommand("tab-lock")
    .alias("lock")
    .description("Toggle the locked state of the active tab.");

  program
    .cliCommand("tab-synchronize")
    .alias("synchronize")
    .description("Toggle the synchronized state of the active tab.");

  return program;
}
