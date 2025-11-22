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
import type { BrowserQueryResult } from "../shared/cli/browser";

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
  .cliCommand("browser-capture", async (request, paneId, options) => {
    const filePath = await request({ paneId, handle: options.handle });
    process.stdout.write(`Screenshot saved to: ${filePath}\n`);
  })
  .alias("capture")
  .description("Capture a screenshot of a specific browser pane")
  .argument("<paneId>", "The browser pane to capture")
  .option("-h, --handle <handle>", "Element handle to crop to");

program
  .cliCommand("browser-navigate", (request, paneId, url) =>
    request({ paneId, url }),
  )
  .alias("navigate")
  .description("Navigate a browser pane to a specific URL")
  .argument("<paneId>", "The browser pane to navigate")
  .argument("<url>", "The URL to navigate to");

program
  .cliCommand("browser-back", (request, paneId) => request({ paneId }))
  .description("Navigate back in browser history")
  .argument("<paneId>", "The browser pane to navigate");

program
  .cliCommand("browser-forward", (request, paneId) => request({ paneId }))
  .description("Navigate forward in browser history")
  .argument("<paneId>", "The browser pane to navigate");

program
  .cliCommand("browser-refresh", (request, paneId) => request({ paneId }))
  .description("Refresh the browser pane")
  .argument("<paneId>", "The browser pane to refresh");

program
  .cliCommand(
    "browser-query",
    async (request, paneId, selector, options): Promise<void> => {
      const result = await request({
        paneId,
        selector,
        contextHandle: options.context,
        text: options.text,
        role: options.role,
        maxResults: options.maxResults,
        timeout: options.timeout,
        dumpTree: options.dumpTree,
      });

      process.stdout.write(
        JSON.stringify(result as BrowserQueryResult, null, 2) + "\n",
      );
    },
  )
  .description("Query for elements inside a browser pane")
  .argument("<paneId>", "Target browser pane")
  .argument("[selector]", "CSS selector to match")
  .option("-c, --context <handle>", "Parent element handle")
  .option("-t, --text <text>", "Filter elements whose text includes the value")
  .option("-r, --role <role>", "ARIA role to filter by")
  .option("-m, --max-results <count>", "Maximum number of results", (value) =>
    parseInt(value, 10),
  )
  .option("--timeout <ms>", "Timeout for query", (value) => parseInt(value, 10))
  .option("--dump-tree", "Return a compact accessibility tree snapshot");

program
  .cliCommand("browser-click", (request, paneId, handle, options) =>
    request({
      paneId,
      handle,
      button: options.button ?? "left",
      clicks: options.clicks ?? 1,
      offset: {
        x: options.offsetX,
        y: options.offsetY,
      },
    }),
  )
  .description("Click an element in a browser pane")
  .argument("<paneId>", "Target browser pane")
  .argument("<handle>", "Handle of the element to click")
  .addOption(
    new Option("-b, --button <button>", "Mouse button")
      .choices(["left", "middle", "right"])
      .default("left"),
  )
  .option("-c, --clicks <count>", "Number of clicks", (value) =>
    parseInt(value, 10),
  )
  .option("--offset-x <x>", "X offset from element top-left", (value) =>
    parseInt(value, 10),
  )
  .option("--offset-y <y>", "Y offset from element top-left", (value) =>
    parseInt(value, 10),
  );

program
  .cliCommand("browser-type", (request, paneId, handle, text, options) =>
    request({
      paneId,
      handle,
      text,
      submit: options.submit,
      delay: options.delay,
      replace: options.replace,
    }),
  )
  .description("Type text into an element")
  .argument("<paneId>", "Target browser pane")
  .argument("<handle>", "Handle of the element to type into")
  .argument("<text>", "Text to type")
  .option("-s, --submit", "Submit with Enter after typing")
  .option("-d, --delay <ms>", "Delay between keystrokes", (value) =>
    parseInt(value, 10),
  )
  .option("-r, --replace", "Replace existing value instead of appending");

program
  .cliCommand("browser-keys", (request, paneId, keys) =>
    request({ paneId, keys }),
  )
  .description("Send raw key presses to the active element")
  .argument("<paneId>", "Target browser pane")
  .argument("<keys...>", "Keys or chords to send (e.g. Enter, Meta+R)");

program
  .cliCommand("browser-scroll", (request, paneId, handle, options) =>
    request({
      paneId,
      handle,
      x: options.x,
      y: options.y,
      direction: options.direction,
      smooth: options.smooth,
    }),
  )
  .description("Scroll the page or a specific element")
  .argument("<paneId>", "Target browser pane")
  .argument("[handle]", "Handle of the element to scroll")
  .option("-x, --x <pixels>", "Horizontal scroll delta", (value) =>
    parseInt(value, 10),
  )
  .option("-y, --y <pixels>", "Vertical scroll delta", (value) =>
    parseInt(value, 10),
  )
  .option("-d, --direction <direction>", "Direction to scroll", [
    "up",
    "down",
    "left",
    "right",
  ])
  .option("-s, --smooth", "Use smooth scrolling where supported");

program
  .cliCommand("browser-wait", (request, paneId, selector, options) =>
    request({
      paneId,
      selector,
      state: options.state,
      timeout: options.timeout,
    }),
  )
  .description("Wait for a selector or page state")
  .argument("<paneId>", "Target browser pane")
  .argument("[selector]", "Optional selector to wait for")
  .option("-s, --state <state>", "Load state to wait for", [
    "domcontentloaded",
    "networkidle",
  ])
  .option("--timeout <ms>", "Timeout before failing", (value) =>
    parseInt(value, 10),
  );

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
