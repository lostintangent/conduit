import type { TerminalInstance } from "../types";

const terminals = new Map<string, TerminalInstance>();

export const storeTerminal = (terminal: TerminalInstance) => {
  terminals.set(terminal.id, terminal);
};

export const getTerminal = (terminalId: string): TerminalInstance | undefined =>
  terminals.get(terminalId);

export const getAllTerminals = () => terminals;

export const removeTerminal = (terminalId: string) => {
  terminals.delete(terminalId);
};
