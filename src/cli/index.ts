import { Argument, Command, Option } from "commander";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CLI_COMMAND_NAME,
  PANE_MOVE_TARGETS,
  PANE_SPLIT_TARGETS,
  PANE_TYPES,
} from "../shared/cli/types";

// Import the cliCommand extension to commander
// that allows defining CLI command handlers
// in a fully type manner.
import "./command";

const program = new Command(CLI_COMMAND_NAME).description(
  "Interact with Conduit, from within Conduit!",
);

/* Pane commands */

program
  .cliCommand("list-panes", async (request, { type }) => {
    const panes = await request({ paneType: type });
    console.log(JSON.stringify(panes, null, 2));
  })
  .alias("list")
  .description("List the other panes in the active Conduit tab.")
  .addOption(
    new Option("-t, --type <paneType>", "Filter panes by type")
      .choices(PANE_TYPES)
      .default("all"),
  );

program
  .cliCommand("split-pane", (request, direction) => request({ direction }))
  .alias("split")
  .description("Split the active pane in the requested direction.")
  .addArgument(
    new Argument("[direction]", "Direction to split the active pane")
      .choices(PANE_SPLIT_TARGETS)
      .default("right"),
  );

program
  .cliCommand("move-pane", (request, direction) => request({ direction }))
  .alias("move")
  .description("Move the active pane to a new location.")
  .addArgument(
    new Argument("[direction]", "Direction to move the active pane")
      .choices(PANE_MOVE_TARGETS)
      .default("tab"),
  );

program
  .cliCommand("close-pane", (request, { closeTab }) =>
    request({ closeTab: Boolean(closeTab) }),
  )
  .alias("close")
  .description("Close the active pane or tab.")
  .option("-t, --tab", "Close the active tab instead of the pane.");

program
  .cliCommand("focus-pane")
  .alias("focus")
  .description("Toggle focus mode for the active pane.");

/* Tab commands */

program.cliCommand("new-tab").alias("new").description("Open a new tab.");

program
  .cliCommand("duplicate-tab")
  .alias("duplicate")
  .description("Duplicate the active tab.");

/* Terminal commands */

program
  .cliCommand("read-terminal", async (request, sessionId) => {
    const contents = await request({ sessionId });
    process.stdout.write(contents);
  })
  .alias("read")
  .description("Read the contents of a terminal session")
  .argument("<sessionId>", "The terminal session to read");

program
  .cliCommand(
    "write-terminal",
    async (request, sessionId, inputParts: string[], { newline }) => {
      if (newline) {
        inputParts.push("\n");
      }

      const input = inputParts.join(" ");
      await request({ sessionId, input });
    },
  )
  .alias("write")
  .description("Send input to a terminal session")
  .argument("<sessionId>", "The terminal session to write to")
  .argument("<input...>", "Input to send to the terminal")
  .option("-n, --newline", "Add a newline to the end of the input");

/* Browser commands */

program
  .cliCommand("capture-browser", async (request, paneId) => {
    const filePath = await request({ paneId });
    process.stdout.write(`Screenshot saved to: ${filePath}\n`);
  })
  .alias("capture")
  .description("Capture a screenshot of a specific browser pane")
  .argument("<paneId>", "The browser pane to capture");

/* Editor commands */

program
  .cliCommand(
    "open-file",
    async (request, filePath) => {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      let stats: Stats;
      try {
        stats = await fs.stat(resolvedPath);
      } catch {
        throw new Error(`No such file or directory: ${filePath}`);
      }

      const target = stats.isDirectory()
        ? { cwd: resolvedPath }
        : { cwd: path.dirname(resolvedPath), filePath: resolvedPath };

      await request(target);
    },
    { isDefault: true },
  )
  .alias("open")
  .description("Open a file or directory in the Conduit editor")
  .argument("<path>", "File or directory to open");

// Execute the CLI program
program.parseAsync(process.argv).catch(({ message }) => {
  console.error(message);
  process.exit(1);
});
