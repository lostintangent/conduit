import { Command, Option } from "commander";
import { PANE_TYPES, PaneType } from "../../shared/cli";
import { sendCliRequest } from "../ipc";

const COMMAND_NAME = "list-panes";

const command = new Command(COMMAND_NAME)
  .description("List the other panes in the active Conduit tab.")
  .addOption(
    new Option("-t, --type <paneType>", "Filter panes by type")
      .choices(PANE_TYPES)
      .default("all"),
  )
  .action(async (options: { type: PaneType }) => {
    const { data } = await sendCliRequest({
      type: COMMAND_NAME,
      paneType: options.type,
    });
    console.log(JSON.stringify(data, null, 2));
  });

export default command;
