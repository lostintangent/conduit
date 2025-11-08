import { Argument, Command } from "commander";
import { sendCliRequest } from "../ipc";
import type { CliMovePaneDirection } from "../../shared/cli";

const COMMAND_NAME = "move";
const MOVE_CHOICES = ["left", "right", "up", "down", "tab", "<", ">"] as const;

function normalizeDirection(
  value: (typeof MOVE_CHOICES)[number],
): CliMovePaneDirection {
  switch (value) {
    case "<":
      return "left";
    case ">":
      return "right";
    default:
      return value;
  }
}

const command = new Command(COMMAND_NAME)
  .description("Move the active pane in the current Conduit tab.")
  .addArgument(
    new Argument("[direction]", "Direction to move the active pane")
      .choices(MOVE_CHOICES as readonly string[])
      .default("tab"),
  )
  .action(async (direction: (typeof MOVE_CHOICES)[number]) => {
    const normalizedDirection = normalizeDirection(direction);

    await sendCliRequest({
      type: COMMAND_NAME,
      direction: normalizedDirection,
    });
  });

export default command;
