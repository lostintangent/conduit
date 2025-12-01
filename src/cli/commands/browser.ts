import type {
  BrowserAutomationOption,
  BrowserQueryResult,
} from "@shared/cli/browser";
import {
  BROWSER_AUTOMATION_COMMANDS,
  SIMPLE_BROWSER_COMMANDS,
} from "@shared/cli/browser";
import { Command, Option } from "commander";

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

export default function (program: Command): Command {
  for (const command of SIMPLE_BROWSER_COMMANDS) {
    const cliCommand = program
      .cliCommand(command.name, async (request, ...rawArgs) => {
        const options = rawArgs.pop();
        const commandArgs = command.buildArgs(rawArgs, options);
        const result = await request(commandArgs);

        if (command.respondWithResult && command.formatResult) {
          process.stdout.write(command.formatResult(result));
        }
      })
      .description(command.description)
      .paneOption(command.paneDescription);

    if (command.alias) {
      cliCommand.alias(command.alias);
    }

    if (command.argument) {
      cliCommand.argument(...command.argument);
    }
  }

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
