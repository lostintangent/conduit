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
 * Automatically deletes the VM if no terminals remain connected.
 */
export const removeTerminalFromCloudEnvironment = async (
  vmId: string,
  terminalId: string,
) => {
  const cloudEnv = cloudEnvironments.get(vmId);
  if (cloudEnv) {
    cloudEnv.connectedTerminals.delete(terminalId);

    // If no more terminals are connected, delete the VM
    if (cloudEnv.connectedTerminals.size === 0) {
      console.log(
        `[VM] No more terminals connected to VM ${vmId}, deleting VM`,
      );
      try {
        const { deleteVM } = await import("../../vm/client");
        await deleteVM(vmId);
        console.log(`[VM] Successfully deleted VM ${vmId}`);
        // Remove from our store
        cloudEnvironments.delete(vmId);
      } catch (error) {
        // Ignore 404 errors - VM was already deleted (e.g., by idle timeout)
        if (error instanceof Error && error.message.includes("404")) {
          console.log(`[VM] VM ${vmId} was already deleted`);
          cloudEnvironments.delete(vmId);
        } else {
          console.error(`[VM] Failed to delete VM ${vmId}:`, error);
        }
      }
    } else {
      console.log(
        `[VM] Other terminals still connected to VM ${vmId}, keeping VM alive`,
      );
    }
  }
};

/**
 * Check if a cloud environment has any connected terminals.
 */
export const hasConnectedTerminals = (vmId: string): boolean => {
  const cloudEnv = cloudEnvironments.get(vmId);
  return cloudEnv ? cloudEnv.connectedTerminals.size > 0 : false;
};
