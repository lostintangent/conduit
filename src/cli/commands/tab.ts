import { Command } from "commander";

export default function (program: Command): Command {
  program.cliCommand("tab-new").alias("new").description("Open a new tab.");

  program
    .cliCommand("tab-duplicate")
    .alias("duplicate")
    .description("Duplicate the active tab.");

  return program;
}
