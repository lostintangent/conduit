import type { CloudEnvironment } from "../../terminal/types";

const cloudEnvironments = new Map<string, CloudEnvironment>();

/**
 * Store a cloud environment indexed by VM ID.
 */
export const storeCloudEnvironment = (cloudEnvironment: CloudEnvironment) => {
  cloudEnvironments.set(cloudEnvironment.vmId, cloudEnvironment);
};

/**
 * Get a cloud environment by VM ID.
 */
export const getCloudEnvironment = (
  vmId: string,
): CloudEnvironment | undefined => {
  return cloudEnvironments.get(vmId);
};

/**
 * Get all cloud environments.
 */
export const getAllCloudEnvironments = () => cloudEnvironments;

/**
 * Remove a cloud environment by VM ID.
 */
export const removeCloudEnvironment = (vmId: string) => {
  cloudEnvironments.delete(vmId);
};

/**
 * Associate a terminal with a cloud environment.
 */
export const addTerminalToCloudEnvironment = (
  vmId: string,
  terminalId: string,
) => {
  const cloudEnv = cloudEnvironments.get(vmId);
  if (cloudEnv) {
    cloudEnv.connectedTerminals.add(terminalId);
  }
};

/**
 * Disassociate a terminal from a cloud environment.
 */
export const removeTerminalFromCloudEnvironment = (
  vmId: string,
  terminalId: string,
) => {
  const cloudEnv = cloudEnvironments.get(vmId);
  if (cloudEnv) {
    cloudEnv.connectedTerminals.delete(terminalId);
  }
};

/**
 * Check if a cloud environment has any connected terminals.
 */
export const hasConnectedTerminals = (vmId: string): boolean => {
  const cloudEnv = cloudEnvironments.get(vmId);
  return cloudEnv ? cloudEnv.connectedTerminals.size > 0 : false;
};
