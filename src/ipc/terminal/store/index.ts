import type { CloudEnvironment, TerminalInstance } from "../types";

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

/**
 * Get CloudEnvironment by VM ID.
 * Scans all terminals to find one with matching vmId.
 */
export const getCloudEnvironmentByVmId = (
  vmId: string,
): CloudEnvironment | undefined => {
  for (const terminal of terminals.values()) {
    if (terminal.cloudEnvironment?.vmId === vmId) {
      return terminal.cloudEnvironment;
    }
  }
  return undefined;
};
