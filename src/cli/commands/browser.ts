import type {
  BrowserAutomationOption,
  BrowserQueryResult,
} from "@shared/cli/browser";
import { BROWSER_AUTOMATION_COMMANDS } from "@shared/cli/browser";
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

function applyOption(cliCommand: Command, option: BrowserAutomationOption) {
  if (option.choices) {
    const choiceOption = new Option(option.flags, option.description).choices(
      option.choices,
    );

    if (option.defaultValue !== undefined) {
      choiceOption.default(option.defaultValue);
    }

    cliCommand.addOption(choiceOption);
    return;
  }

  const parser = option.parser === "int" ? parseInteger : undefined;

  if (parser) {
    cliCommand.option(option.flags, option.description, parser);
    return;
  }

  if (option.defaultValue !== undefined) {
    cliCommand.option(option.flags, option.description, option.defaultValue);
    return;
  }

  cliCommand.option(option.flags, option.description);
}

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

  for (const command of BROWSER_AUTOMATION_COMMANDS) {
    const cliCommand = program
      .cliCommand(command.name, async (request, ...rawArgs) => {
        const options = rawArgs.pop();
        const commandArgs = command.buildArgs(rawArgs, options);
        const result = await request(commandArgs);

        if (command.respondWithResult) {
          process.stdout.write(
            JSON.stringify(result as BrowserQueryResult, null, 2) + "\n",
          );
        }
      })
      .description(command.description)
      .paneOption(command.paneDescription);

    if (command.alias) {
      cliCommand.alias(command.alias);
    }

    for (const [argument, description] of command.arguments ?? []) {
      cliCommand.argument(argument, description);
    }

    for (const option of command.options ?? []) {
      applyOption(cliCommand, option);
    }
  }

  return program;
}
