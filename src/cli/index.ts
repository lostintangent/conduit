import { Argument, Command, Option } from "commander";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CLI_COMMAND_NAME,
  PANE_MOVE_TARGETS,
  PANE_SPLIT_TARGETS,
  PANE_SPLIT_TYPES,
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
  .cliCommand("split-pane", (request, direction, { type }) =>
    request({ direction, paneType: type }),
  )
  .alias("split")
  .description("Split the active pane in the requested direction.")
  .addArgument(
    new Argument("[direction]", "Direction to split the active pane")
      .choices(PANE_SPLIT_TARGETS)
      .default("right"),
  )
  .addOption(
    new Option("-t, --type <paneType>", "Type of pane to open")
      .choices(PANE_SPLIT_TYPES)
      .default("terminal"),
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
    async (request, sessionId, inputParts: string[], { enter }) => {
      const input = inputParts.join(" ");
      await request({ sessionId, input, enter: !!enter });
    },
  )
  .alias("write")
  .description("Send input to a terminal session")
  .argument(
    "<sessionId>",
    "The terminal session to write to (use '*' for all terminals in the tab)",
  )
  .argument("<input...>", "Input to send to the terminal")
  .option("-e, --enter", "Simular press enter/return after sending the input");

/* Browser commands */

program
  .cliCommand("capture-browser", async (request, paneId) => {
    const filePath = await request({ paneId });
    process.stdout.write(`Screenshot saved to: ${filePath}\n`);
  })
  .alias("capture")
  .description("Capture a screenshot of a specific browser pane")
  .argument("<paneId>", "The browser pane to capture");

program
  .cliCommand("navigate-browser", (request, paneId, url) =>
    request({ paneId, url }),
  )
  .alias("navigate")
  .description("Navigate a browser pane to a specific URL")
  .argument("<paneId>", "The browser pane to navigate")
  .argument("<url>", "The URL to navigate to");

program
  .cliCommand("browser-click", (request, paneId, selector, options) =>
    request({
      paneId,
      selector,
      nth: options.nth,
      state: options.state,
      timeoutMs: options.timeout,
    }),
  )
  .description("Click an element in the target browser pane")
  .argument("<paneId>", "The browser pane to target")
  .argument("<selector>", "CSS selector to click")
  .addOption(
    new Option(
      "--nth <index>",
      "Index to select when multiple matches are found",
    ).argParser(Number),
  )
  .addOption(
    new Option("--state <state>", "Wait condition before clicking")
      .choices(["attached", "visible"])
      .default("visible"),
  )
  .addOption(
    new Option("--timeout <ms>", "Timeout in milliseconds").argParser(Number),
  );

program
  .cliCommand("browser-type", (request, paneId, selector, text, options) =>
    request({
      paneId,
      selector,
      text,
      nth: options.nth,
      clear: options.clear,
      enterKey: options.enter,
      state: options.state,
      timeoutMs: options.timeout,
    }),
  )
  .description("Type into an element in the target browser pane")
  .argument("<paneId>", "The browser pane to target")
  .argument("<selector>", "CSS selector to type into")
  .argument("<text>", "Text to enter")
  .addOption(
    new Option(
      "--nth <index>",
      "Index to select when multiple matches are found",
    ).argParser(Number),
  )
  .addOption(
    new Option("--state <state>", "Wait condition before typing")
      .choices(["attached", "visible"])
      .default("visible"),
  )
  .addOption(
    new Option("--timeout <ms>", "Timeout in milliseconds").argParser(Number),
  )
  .option("--clear", "Clear the field before typing")
  .option("--enter", "Send an Enter key after typing");

program
  .cliCommand("browser-scroll", (request, paneId, selector, options) =>
    request({
      paneId,
      selector: selector === "" ? undefined : selector,
      intoView: options.intoView,
      x: options.x,
      y: options.y,
    }),
  )
  .description("Scroll within a browser pane")
  .argument("<paneId>", "The browser pane to target")
  .argument("[selector]", "Optional selector to scroll into view")
  .addOption(
    new Option("--x <pixels>", "Horizontal scroll offset").argParser(Number),
  )
  .addOption(
    new Option("--y <pixels>", "Vertical scroll offset").argParser(Number),
  )
  .option("--into-view", "Center the selector in view when provided");

program
  .cliCommand("browser-evaluate", async (request, paneId, script) => {
    const result = await request({ paneId, script });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  })
  .description("Run arbitrary JavaScript inside a browser pane")
  .argument("<paneId>", "The browser pane to target")
  .argument("<script>", "JavaScript snippet to execute");

program
  .cliCommand(
    "browser-wait-for",
    async (request, paneId, selector, options) => {
      const result = await request({
        paneId,
        selector,
        nth: options.nth,
        state: options.state,
        timeoutMs: options.timeout,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    },
  )
  .description("Wait for a selector to meet the requested condition")
  .argument("<paneId>", "The browser pane to target")
  .argument("<selector>", "CSS selector to wait for")
  .addOption(
    new Option(
      "--nth <index>",
      "Index to select when multiple matches are found",
    ).argParser(Number),
  )
  .addOption(
    new Option("--state <state>", "Wait condition")
      .choices(["attached", "visible"])
      .default("visible"),
  )
  .addOption(
    new Option("--timeout <ms>", "Timeout in milliseconds").argParser(Number),
  );

program
  .cliCommand("browser-query", async (request, paneId, selector) => {
    const result = await request({ paneId, selector });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  })
  .description("Return metadata for matching elements in a browser pane")
  .argument("<paneId>", "The browser pane to target")
  .argument("<selector>", "CSS selector to query");

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
