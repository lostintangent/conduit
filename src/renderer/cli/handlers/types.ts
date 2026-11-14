import type { Tab } from "@features/workbench/model";
import type { CliCommand, CliCommandArgs } from "@shared/cli/types";

export type HandlerContext = {
  sessionId: string;
  activeTab: Tab | null;
  activeCwd: string;
  findCallingTerminalTab: () => Tab;
};

// Commands with arguments always send them, and useCliClient passes `{}` for
// commands without any.
type CliHandler<Name extends CliCommand["name"]> = (
  args: NonNullable<CliCommandArgs<Name>>,
  context: HandlerContext,
) => Promise<unknown> | unknown;

export type HandlerMap = {
  [Name in CliCommand["name"]]: CliHandler<Name>;
};
