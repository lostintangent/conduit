import type { TerminalCreateOptions } from "../model";
import { captureTerminalCommand } from "./command";
import { promptTerminal } from "./prompt";
import { getTerminal } from "./store";
import {
  createTerminal,
  killTerminal,
  markTerminalReady,
  resizeTerminal,
  writeTerminal,
} from "./store/actions";

const service = {
  async create(options?: TerminalCreateOptions) {
    const { id, title, cwd } = await createTerminal(options);
    return { sessionId: id, title, cwd };
  },

  /** Called once the renderer can show output, which flushes what buffered. */
  ready: markTerminalReady,

  input: writeTerminal,

  resize: resizeTerminal,

  close: killTerminal,

  async captureCommand(sessionId: string) {
    const terminal = getTerminal(sessionId);
    return terminal ? captureTerminalCommand(terminal) : null;
  },

  prompt: promptTerminal,
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    terminal: typeof service;
  }
}
