import { getCloudEnvironment } from "../../vm/store";
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
 * Delegates to the VM store.
 */
export const getCloudEnvironmentByVmId = (
  vmId: string,
): CloudEnvironment | undefined => {
  return getCloudEnvironment(vmId);
};

/**
 * Get all terminals connected to a specific VM.
 */
export const getTerminalsByVmId = (vmId: string): TerminalInstance[] => {
  const result: TerminalInstance[] = [];
  for (const terminal of terminals.values()) {
    if (terminal.vmId === vmId) {
      result.push(terminal);
    }
  }
  return result;
};
