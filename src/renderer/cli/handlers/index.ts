import { browserHandlers } from "@features/browser/cli/handler";
import { canvasHandlers } from "@features/canvas/cli/handler";
import { editorHandlers } from "@features/editor/cli/handler";
import { notificationHandlers } from "@features/workbench/cli/notificationHandler";
import { paneHandlers } from "@features/workbench/cli/paneHandler";
import { tabHandlers } from "@features/workbench/cli/tabHandler";
import { terminalHandlers } from "@features/terminal/cli/handler";
import type { HandlerMap } from "./types";

export const handlerMap = {
  ...editorHandlers,
  ...paneHandlers,
  ...tabHandlers,
  ...terminalHandlers,
  ...browserHandlers,
  ...canvasHandlers,
  ...notificationHandlers,
} as HandlerMap;

export * from "./types";
