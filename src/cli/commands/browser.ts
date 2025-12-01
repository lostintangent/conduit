import type { BrowserQueryResult } from "@shared/cli/browser";
import type { CliCommand } from "@shared/cli/types";
import { Command, Option } from "commander";

// Extract browser command names that can be registered with the simple pane helper
type SimpleBrowserCommandName = Extract<
  CliCommand,
  { name: `browser-${string}` } & { args?: { paneId?: string } }
>["name"];

type BrowserCommand<
  Name extends SimpleBrowserCommandName = SimpleBrowserCommandName,
> = {
  name: Name;
  alias?: string;
  description: string;
  argument?: [string, string];
  paneDescription: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (request: any, ...args: any[]) => void | Promise<void>;
};

const parseInteger = (value: string) => parseInt(value, 10);

const offsetOptions = [
  new Option("--offset-x <x>", "X offset from element top-left").argParser(
    parseInteger,
  ),
  new Option("--offset-y <y>", "Y offset from element top-left").argParser(
    parseInteger,
  ),
];

function registerPaneCommands<Name extends SimpleBrowserCommandName>(
  program: Command,
  commands: BrowserCommand<Name>[],
) {
  for (const command of commands) {
    const cliCommand = program
      .cliCommand(command.name, command.action)
      .description(command.description)
      .paneOption(command.paneDescription);

    if (command.alias) {
      cliCommand.alias(command.alias);
    }

    if (command.argument) {
      cliCommand.argument(...command.argument);
    }
  }
}

export default function (program: Command): Command {
  registerPaneCommands(program, [
    {
      name: "browser-capture",
      alias: "capture",
      description: "Capture a screenshot of a browser pane",
      paneDescription: "The ID of the pane to capture",
      action: async (request, options) => {
        const filePath = await request({
          paneId: options.pane,
        });
        process.stdout.write(`Screenshot saved to: ${filePath}\n`);
      },
    },
    {
      name: "browser-navigate",
      alias: "navigate",
      description: "Navigate a browser pane to a specific URL",
      paneDescription: "The ID of the pane to navigate",
      argument: ["<url>", "The URL to navigate to"],
      action: (request, url, options) => request({ paneId: options.pane, url }),
    },
    {
      name: "browser-back",
      alias: "back",
      description: "Navigate a browser pane back in its history",
      paneDescription: "The ID of the pane to navigate",
      action: (request, options) => request({ paneId: options.pane }),
    },
    {
      name: "browser-forward",
      alias: "forward",
      description: "Navigate a browser pane forward in its history",
      paneDescription: "The ID of the pane to navigate",
      action: (request, options) => request({ paneId: options.pane }),
    },
    {
      name: "browser-refresh",
      alias: "refresh",
      description: "Refresh a browser pane",
      paneDescription: "The ID of the pane to refresh",
      action: (request, options) => request({ paneId: options.pane }),
    },
  ]);

  program
    .cliCommand(
      "browser-query",
      async (request, selector, options): Promise<void> => {
        const result = await request({
          paneId: options.pane,
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
    .argument("[selector]", "CSS selector to match")
    .paneOption("The ID of the pane to query")
    .option("-c, --context <handle>", "Parent element handle")
    .option(
      "-t, --text <text>",
      "Filter elements whose text includes the value",
    )
    .option("-r, --role <role>", "ARIA role to filter by")
    .option(
      "-m, --max-results <count>",
      "Maximum number of results",
      parseInteger,
    )
    .option("--timeout <ms>", "Timeout for query", parseInteger)
    .option("--dump-tree", "Return a compact accessibility tree snapshot");

  program
    .cliCommand("browser-click", (request, handle, options) =>
      request({
        paneId: options.pane,
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
    .argument("<handle>", "Handle of the element to click")
    .paneOption("The ID of the pane to click in")
    .addOption(
      new Option("-b, --button <button>", "Mouse button")
        .choices(["left", "middle", "right"])
        .default("left"),
    )
    .option("-c, --clicks <count>", "Number of clicks", parseInteger)
    .addOption(offsetOptions[0])
    .addOption(offsetOptions[1]);

  program
    .cliCommand("browser-hover", (request, handle, options) =>
      request({
        paneId: options.pane,
        handle,
        offset: {
          x: options.offsetX,
          y: options.offsetY,
        },
      }),
    )
    .description("Hover over an element in a browser pane")
    .argument("<handle>", "Handle of the element to hover")
    .paneOption("The ID of the pane to hover in")
    .addOption(offsetOptions[0])
    .addOption(offsetOptions[1]);

  program
    .cliCommand("browser-focus", (request, handle, options) =>
      request({ paneId: options.pane, handle, scroll: options.scroll }),
    )
    .description("Focus an element in a browser pane")
    .argument("<handle>", "Handle of the element to focus")
    .paneOption("The ID of the pane to focus in")
    .option(
      "--no-scroll",
      "Do not scroll the element into view before focusing",
    );

  program
    .cliCommand("browser-type", (request, handle, text, options) =>
      request({
        paneId: options.pane,
        handle,
        text,
        submit: options.submit,
        delay: options.delay,
        replace: options.replace,
      }),
    )
    .description("Type text into an element")
    .argument("<handle>", "Handle of the element to type into")
    .argument("<text>", "Text to type")
    .paneOption("The ID of the pane to type in")
    .option("-s, --submit", "Submit with Enter after typing")
    .option("-d, --delay <ms>", "Delay between keystrokes", parseInteger)
    .option("-r, --replace", "Replace existing value instead of appending");

  program
    .cliCommand("browser-keys", (request, keys, options) =>
      request({ paneId: options.pane, keys }),
    )
    .description("Send raw key presses to the active element")
    .argument("<keys...>", "Keys or chords to send (e.g. Enter, Meta+R)")
    .paneOption("The ID of the pane to send keys to");

  program
    .cliCommand("browser-scroll", (request, handle, options) =>
      request({
        paneId: options.pane,
        handle,
        x: options.x,
        y: options.y,
        direction: options.direction,
        smooth: options.smooth,
      }),
    )
    .description("Scroll the page or a specific element")
    .argument("[handle]", "Handle of the element to scroll")
    .paneOption("The ID of the pane to scroll")
    .option("-x, --x <pixels>", "Horizontal scroll delta", parseInteger)
    .option("-y, --y <pixels>", "Vertical scroll delta", parseInteger)
    .option("-d, --direction <direction>", "Direction to scroll", [
      "up",
      "down",
      "left",
      "right",
    ])
    .option("-s, --smooth", "Use smooth scrolling where supported");

  program
    .cliCommand("browser-wait", (request, selector, options) =>
      request({
        paneId: options.pane,
        selector,
        state: options.state,
        timeout: options.timeout,
      }),
    )
    .description("Wait for a selector or page state")
    .argument("[selector]", "Optional selector to wait for")
    .paneOption("The ID of the pane to wait on")
    .option("-s, --state <state>", "Load state to wait for", [
      "domcontentloaded",
      "networkidle",
    ])
    .option("--timeout <ms>", "Timeout before failing", parseInteger);

  return program;
}
