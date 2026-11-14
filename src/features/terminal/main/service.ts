import type { TerminalCreateOptions } from "../model";
import { captureTerminalCommand } from "./command";
import { promptTerminal } from "./prompt";
import { getTerminal } from "./store";
import {
  acknowledgeTerminalOutput,
  createTerminal,
  killTerminal,
  resizeTerminal,
  setTerminalVisible,
  writeTerminal,
} from "./store/actions";

const service = {
  async create(options?: TerminalCreateOptions) {
    const { id, title, cwd } = await createTerminal(options);
    return { sessionId: id, title, cwd };
  },

  input: writeTerminal,

  /** The renderer has parsed this much output, which can resume a paused shell. */
  ack: acknowledgeTerminalOutput,

  /** Output for a shell no pane shows is sent less often. */
  setVisible: setTerminalVisible,

  /** The first resize from a pane also sends the output its shell kept. */
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
