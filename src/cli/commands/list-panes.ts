import { Pane } from "@/types";
import { Command, Option } from "commander";
import { PANE_TYPES, PaneType } from "../../shared/cli/types";
import { sendCliCommand } from "../ipc";

const COMMAND_NAME = "list-panes";

export default new Command(COMMAND_NAME)
  .alias("list")
  .description("List the other panes in the active Conduit tab.")
  .addOption(
    new Option("-t, --type <paneType>", "Filter panes by type")
      .choices(PANE_TYPES)
      .default("all"),
  )
  .action(async (options: { type: PaneType }) => {
    const panes = await sendCliCommand<Pane[]>(COMMAND_NAME, {
      paneType: options.type,
    });
    console.log(JSON.stringify(panes, null, 2));
  });
