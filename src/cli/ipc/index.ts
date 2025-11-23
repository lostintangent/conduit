import { Command, CommandOptions } from "commander";
import type { CliCommand, DefineCommand } from "../../shared/cli/types";
import { sendCliCommand } from "./ipc";

export type ExtractArgs<Name extends CliCommand["name"]> =
  Extract<CliCommand, { name: Name }> extends { args?: infer A } ? A : never;

type ExtractResult<Name extends CliCommand["name"]> =
  Extract<CliCommand, { name: Name }> extends DefineCommand<any, any, infer R>
    ? R
    : void;

type CliCommandCallback<Name extends CliCommand["name"]> = (
  request: <Result = ExtractResult<Name>>(
    args?: ExtractArgs<Name>,
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
      const request = <Result = ExtractResult<Name>>(
        args?: ExtractArgs<Name>,
      ): Promise<Result> => sendCliCommand(commandName, args);

      if (callback) {
        await callback(request, ...actionArgs);
      } else {
        await request();
      }
    },
  );
}

declare module "commander" {
  interface Command {
    cliCommand: typeof cliCommand;
  }
}

Command.prototype.cliCommand = cliCommand;
