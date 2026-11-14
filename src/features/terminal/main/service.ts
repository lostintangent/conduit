import type { TerminalCreateOptions } from "../model";
import { captureTerminalCommand } from "./command";
import { promptTerminal } from "./prompt";
import { getTerminal } from "./store";
import {
  createTerminal,
  killTerminal,
  markTerminalReady,
} from "./store/actions";

const service = {
  async create(options?: TerminalCreateOptions) {
    const terminal = await createTerminal(options);
    return {
      sessionId: terminal.id,
      title: terminal.lastProcessName,
      cwd: terminal.cwd,
    };
  },

  /** Called once the renderer can show output, which flushes what buffered. */
  ready: markTerminalReady,

  input(sessionId: string, input: string) {
    getTerminal(sessionId)?.pty.write(input);
  },

  resize(sessionId: string, cols: number, rows: number) {
    getTerminal(sessionId)?.pty.resize(
      Math.max(1, Math.floor(cols)),
      Math.max(1, Math.floor(rows)),
    );
  },

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
