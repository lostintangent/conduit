import { browserHandlers } from "./browser";
import { canvasHandlers } from "./canvas";
import { editorHandlers } from "./editor";
import { notificationHandlers } from "./notification";
import { paneHandlers } from "./pane";
import { tabHandlers } from "./tab";
import { terminalHandlers } from "./terminal";
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
