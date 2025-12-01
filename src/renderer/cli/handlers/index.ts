import type { HandlerMap } from "./types";
import { browserHandlers } from "./browser";
import { editorHandlers } from "./editor";
import { notificationHandlers } from "./notification";
import { paneHandlers } from "./pane";
import { tabHandlers } from "./tab";
import { terminalHandlers } from "./terminal";

export const handlerMap: HandlerMap = {
  ...editorHandlers,
  ...paneHandlers,
  ...tabHandlers,
  ...terminalHandlers,
  ...browserHandlers,
  ...notificationHandlers,
};

export * from "./types";
