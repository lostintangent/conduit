import { loadConfig, reloadConfig as reloadVMConfig } from "./config";

/**
 * VM API Client for interacting with the Firecracker Manager
 * Based on the VM API documentation
 */

export type VM = {
  id: string;
  ip_address: string;
  image_id: string;
  created_at: string;
  created_by?: {
    id: number;
    login: string;
  };
  state: "Running" | "Paused" | "Stopped";
  forwarded_ports: {
    [port: string]: {
      connection_url: string;
      external_port: string;
      description: string;
    };
  };
  labels?: Array<{ id: string; name: string; created_at: string }>;
  github_repo?: {
    owner: string;
    name: string;
    branch_or_hash?: string;
  };
};

export type CreateVMRequest = {
  image: string;
  labels?: string[];
  idle_timeout?: number;
  github_repo?: {
    owner: string;
    name: string;
    branch_or_hash?: string;
    clone_path?: string;
  };
};

export type SSHConnectionInfo = {
  host: string;
  port: number;
  username: string;
};

/**
 * Make an API call to the VM manager
 */
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const config = await loadConfig();
  const url = `${config.managerUrl.replace(/\/$/, "")}/api${endpoint}`;

  const headers: HeadersInit = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`VM API error (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}

/**
 * Create a new VM
 */
export async function createVM(
  request?: Partial<CreateVMRequest>
): Promise<VM> {
  const config = await loadConfig();

  // Build the request, only including defined fields
  const vmRequest: CreateVMRequest = {
    image: request?.image || config.defaultImageId,
  };

  // Only add optional fields if they are defined
  if (request?.labels && request.labels.length > 0) {
    vmRequest.labels = request.labels;
  }

  if (request?.idle_timeout !== undefined) {
    vmRequest.idle_timeout = request.idle_timeout;
  }

  if (request?.github_repo) {
    vmRequest.github_repo = request.github_repo;
  }

  const vm = await apiCall<VM>("/vms", {
    method: "POST",
    body: JSON.stringify(vmRequest),
  });

  console.log(`[VM] Created VM ${vm.id} with IP ${vm.ip_address}`);
  return vm;
}

/**
 * List all VMs accessible to the authenticated user
 */
export async function listVMs(labels?: string[]): Promise<VM[]> {
  const query = labels?.length
    ? `?labels=${labels.join(",")}`
    : "";
  
  return apiCall<VM[]>(`/vms${query}`);
}

/**
 * Get details of a specific VM
 */
export async function getVM(vmId: string): Promise<VM> {
  return apiCall<VM>(`/vms/${vmId}`);
}

/**
 * Delete a VM
 */
export async function deleteVM(vmId: string): Promise<void> {
  await apiCall<void>(`/vms/${vmId}`, {
    method: "DELETE",
  });
  console.log(`[VM] Deleted VM ${vmId}`);
}

/**
 * Update VM activity timestamp (ping to prevent idle timeout)
 */
export async function pingVMActivity(vmId: string): Promise<void> {
  await apiCall<void>(`/vms/${vmId}/activity`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Extract SSH connection info from a VM
 */
export function getSSHConnectionInfo(vm: VM): SSHConnectionInfo {
  const sshPort = vm.forwarded_ports["22"];
  
  if (!sshPort) {
    throw new Error(`VM ${vm.id} does not have SSH port forwarded`);
  }

  const [host, portStr] = sshPort.connection_url.split(":");
  const port = parseInt(portStr, 10);

  if (!host || !port) {
    throw new Error(
      `Invalid SSH connection URL: ${sshPort.connection_url}`
    );
  }

  return {
    host,
    port,
    username: "ace", // Default username from VM API
  };
}

/**
 * Reload configuration (useful after .env.local changes)
 */
export function reloadConfig(): void {
  reloadVMConfig();
}
