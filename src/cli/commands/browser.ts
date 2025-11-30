import type { BrowserQueryResult } from "@shared/cli/browser";
import { Command, Option } from "commander";

export default function (program: Command): Command {
  program
    .cliCommand("browser-capture", async (request, options) => {
      const filePath = await request({
        paneId: options.pane,
      });
      process.stdout.write(`Screenshot saved to: ${filePath}\n`);
    })
    .alias("capture")
    .description("Capture a screenshot of a browser pane")
    .option("-p, --pane <pane>", "The ID of the pane to capture");

  program
    .cliCommand("browser-navigate", (request, url, options) =>
      request({ paneId: options.pane, url }),
    )
    .alias("navigate")
    .description("Navigate a browser pane to a specific URL")
    .argument("<url>", "The URL to navigate to")
    .option("-p, --pane <pane>", "The ID of the pane to navigate");

  program
    .cliCommand("browser-back", (request, options) =>
      request({ paneId: options.pane }),
    )
    .alias("back")
    .description("Navigate a browser pane back in its history")
    .option("-p, --pane <pane>", "The ID of the pane to navigate");

  program
    .cliCommand("browser-forward", (request, options) =>
      request({ paneId: options.pane }),
    )
    .alias("forward")
    .description("Navigate a browser pane forward in its history")
    .option("-p, --pane <pane>", "The ID of the pane to navigate");

  program
    .cliCommand("browser-refresh", (request, options) =>
      request({ paneId: options.pane }),
    )
    .alias("refresh")
    .description("Refresh a browser pane")
    .option("-p, --pane <pane>", "The ID of the pane to refresh");

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
    .option("-p, --pane <pane>", "The ID of the pane to query")
    .option("-c, --context <handle>", "Parent element handle")
    .option(
      "-t, --text <text>",
      "Filter elements whose text includes the value",
    )
    .option("-r, --role <role>", "ARIA role to filter by")
    .option("-m, --max-results <count>", "Maximum number of results", (value) =>
      parseInt(value, 10),
    )
    .option("--timeout <ms>", "Timeout for query", (value) =>
      parseInt(value, 10),
    )
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
    .option("-p, --pane <pane>", "The ID of the pane to click in")
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
    .option("-p, --pane <pane>", "The ID of the pane to hover in")
    .option("--offset-x <x>", "X offset from element top-left", (value) =>
      parseInt(value, 10),
    )
    .option("--offset-y <y>", "Y offset from element top-left", (value) =>
      parseInt(value, 10),
    );

  program
    .cliCommand("browser-focus", (request, handle, options) =>
      request({ paneId: options.pane, handle, scroll: options.scroll }),
    )
    .description("Focus an element in a browser pane")
    .argument("<handle>", "Handle of the element to focus")
    .option("-p, --pane <pane>", "The ID of the pane to focus in")
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
    .option("-p, --pane <pane>", "The ID of the pane to type in")
    .option("-s, --submit", "Submit with Enter after typing")
    .option("-d, --delay <ms>", "Delay between keystrokes", (value) =>
      parseInt(value, 10),
    )
    .option("-r, --replace", "Replace existing value instead of appending");

  program
    .cliCommand("browser-keys", (request, keys, options) =>
      request({ paneId: options.pane, keys }),
    )
    .description("Send raw key presses to the active element")
    .argument("<keys...>", "Keys or chords to send (e.g. Enter, Meta+R)")
    .option("-p, --pane <pane>", "The ID of the pane to send keys to");

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
    .option("-p, --pane <pane>", "The ID of the pane to scroll")
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
    .option("-p, --pane <pane>", "The ID of the pane to wait on")
    .option("-s, --state <state>", "Load state to wait for", [
      "domcontentloaded",
      "networkidle",
    ])
    .option("--timeout <ms>", "Timeout before failing", (value) =>
      parseInt(value, 10),
    );

  return program;
}
