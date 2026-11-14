import type { BrowserAutomationOption } from "@shared/cli/browser";
import { BROWSER_AUTOMATION_COMMANDS } from "@shared/cli/browser";
import { Command, InvalidArgumentError, Option } from "commander";

function parseInteger(value: string) {
  if (!/^-?\d+$/.test(value)) {
    throw new InvalidArgumentError("Expected an integer.");
  }
  return Number(value);
}

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

export default function (program: Command): Command {
  program
    .cliCommand("browser-capture", async (request, options) => {
      const filePath = await request({ paneId: options.pane });
      process.stdout.write(`Screenshot saved to: ${filePath}\n`);
    })
    .alias("capture")
    .description("Capture a screenshot of a browser pane")
    .paneOption("The ID of the pane to capture");

  program
    .cliCommand("browser-navigate", (request, url, options) =>
      request({ paneId: options.pane, url }),
    )
    .alias("navigate")
    .description("Navigate a browser pane to a specific URL")
    .argument("<url>", "The URL to navigate to")
    .paneOption("The ID of the pane to navigate");

  program
    .cliCommand("browser-back", (request, options) =>
      request({ paneId: options.pane }),
    )
    .alias("back")
    .description("Navigate a browser pane back in its history")
    .paneOption("The ID of the pane to navigate");

  program
    .cliCommand("browser-forward", (request, options) =>
      request({ paneId: options.pane }),
    )
    .alias("forward")
    .description("Navigate a browser pane forward in its history")
    .paneOption("The ID of the pane to navigate");

  program
    .cliCommand("browser-refresh", (request, options) =>
      request({ paneId: options.pane }),
    )
    .alias("refresh")
    .description("Refresh a browser pane")
    .paneOption("The ID of the pane to refresh");

  for (const command of BROWSER_AUTOMATION_COMMANDS) {
    const cliCommand = program
      .cliCommand(command.name, async (request, ...actionArgs) => {
        // Commander passes the positional arguments, then the parsed
        // options, then the command itself.
        const [options] = actionArgs.splice(-2);
        const commandArgs = command.buildArgs(actionArgs, options);

        const result = await request(commandArgs);
        // Only print non-boolean results (e.g., element descriptors)
        // Boolean results indicate success/failure via exit code
        if (result && typeof result !== "boolean") {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
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
