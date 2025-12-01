import { Command, CommandOptions } from "commander";
import type {
  CliCommand,
  CliCommandArgs,
  CliCommandResult,
} from "../../shared/cli/types";
import { sendCliCommand } from "./ipc";

type CliCommandCallback<Name extends CliCommand["name"]> = (
  request: <Result = CliCommandResult<Name>>(
    args?: CliCommandArgs<Name>,
  ) => Promise<Result>,
  ...args: any[]
) => Promise<void>;

function cliCommand<Name extends CliCommand["name"]>(
  this: Command,
  commandName: Name,
  callback?: CliCommandCallback<Name>,
  options?: CommandOptions,
): Command {
  return this.command(commandName, options).action(
    async (...actionArgs: any[]) => {
      const request = <Result = CliCommandResult<Name>>(
        args?: CliCommandArgs<Name>,
      ): Promise<Result> => sendCliCommand(commandName, args);

      if (callback) {
        await callback(request, ...actionArgs);
      } else {
        await request();
      }
    },
  );
}

function paneOption(
  this: Command,
  description = "The ID of the pane to target",
): Command {
  return this.option("-p, --pane <pane>", description);
}

declare module "commander" {
  interface Command {
    cliCommand: typeof cliCommand;
    paneOption: typeof paneOption;
  }
}

Command.prototype.cliCommand = cliCommand;
Command.prototype.paneOption = paneOption;
