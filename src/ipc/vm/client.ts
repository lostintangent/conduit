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

export type ForkVMRequest = {
  labels?: string[];
  idle_timeout?: number;
  create_image_from_clone?: boolean;
  clone_forwarded_ports?: boolean;
  collaborators?: Array<{
    username: string;
    role: "read" | "write" | "admin";
  }>;
};

export type AddPortForwardRequest = {
  internal_port: string;
  description?: string;
};

export type AddPortForwardResponse = {
  message: string;
  external_port: string;
  connection_url: string;
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
  options: RequestInit = {},
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
  request?: Partial<CreateVMRequest>,
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
  const query = labels?.length ? `?labels=${labels.join(",")}` : "";

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
 * Pause a running VM
 */
export async function pauseVM(vmId: string): Promise<VM> {
  const vm = await apiCall<VM>(`/vms/${vmId}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "Paused" }),
  });
  console.log(`[VM] Paused VM ${vmId}`);
  return vm;
}

/**
 * Resume a paused VM
 */
export async function resumeVM(vmId: string): Promise<VM> {
  const vm = await apiCall<VM>(`/vms/${vmId}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "Running" }),
  });
  console.log(`[VM] Resumed VM ${vmId}`);
  return vm;
}

/**
 * Get all forwarded ports for a VM
 */
export async function getForwardedPorts(
  vmId: string,
): Promise<VM["forwarded_ports"]> {
  return apiCall<VM["forwarded_ports"]>(`/vms/${vmId}/ports`);
}

/**
 * Add a port forwarding rule to a VM
 * External port is automatically allocated by the system
 */
export async function addPortForward(
  vmId: string,
  internalPort: number,
  description?: string,
): Promise<AddPortForwardResponse> {
  const request: AddPortForwardRequest = {
    internal_port: internalPort.toString(),
  };

  if (description) {
    request.description = description;
  }

  const response = await apiCall<AddPortForwardResponse>(`/vms/${vmId}/ports`, {
    method: "POST",
    body: JSON.stringify(request),
  });

  console.log(
    `[VM] Added port forwarding for VM ${vmId}: ${internalPort} -> ${response.external_port}`,
  );
  return response;
}

/**
 * Remove a port forwarding rule from a VM
 */
export async function removePortForward(
  vmId: string,
  port: string,
): Promise<void> {
  await apiCall<void>(`/vms/${vmId}/ports/${port}`, {
    method: "DELETE",
  });
  console.log(`[VM] Removed port forwarding ${port} from VM ${vmId}`);
}

/**
 * Fork/clone a VM from an existing running VM
 */
export async function forkVM(
  vmId: string,
  options?: ForkVMRequest,
): Promise<VM> {
  const vm = await apiCall<VM>(`/vms/${vmId}/fork`, {
    method: "POST",
    body: JSON.stringify(options || {}),
  });

  console.log(`[VM] Forked VM ${vmId} -> ${vm.id}`);
  return vm;
}

/**
 * List all VMs with the "conduitVM" label
 */
export async function listConduitVMs(): Promise<VM[]> {
  return listVMs(["conduitVM"]);
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
    throw new Error(`Invalid SSH connection URL: ${sshPort.connection_url}`);
  }

  return {
    host,
    port,
    username: "ace", // Default username from VM API
  };
}

/**
 * Execute a command in a VM using the /exec endpoint
 */
export async function executeInVM(
  vmId: string,
  command: string,
  args?: string[],
  timeoutSeconds = 30,
): Promise<{ exit_code: number; stdout: string; stderr: string; error?: string }> {
  const payload = {
    command,
    args: args || [],
    timeout_seconds: timeoutSeconds,
  };

  return apiCall<{ exit_code: number; stdout: string; stderr: string; error?: string }>(
    `/vms/${vmId}/exec`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/**
 * Transfer a diff patch to a VM and apply it to the repository
 * 
 * @param vmId - VM identifier
 * @param diffPatch - The git diff patch as Buffer
 * @param repoPath - Path to the repository in the VM (usually ~/repo_name)
 * @returns true if successful, false otherwise
 */
export async function applyDiffToVM(
  vmId: string,
  diffPatch: Buffer,
  repoPath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[VM] Applying diff patch to ${repoPath} in VM ${vmId}`);
    console.log(`[VM] Patch size: ${diffPatch.length} bytes`);
    console.log(`[VM] Patch type: ${diffPatch.constructor.name}`);
    console.log(`[VM] Is Buffer: ${Buffer.isBuffer(diffPatch)}`);

    // IMPORTANT: When passed through IPC, Buffer becomes Uint8Array
    // We need to convert it back to a proper Buffer
    const patchBuffer = Buffer.isBuffer(diffPatch) 
      ? diffPatch 
      : Buffer.from(diffPatch);

    // Step 1: Write the patch file using the files/write API endpoint
    // Write to /tmp with world-readable permissions
    const patchPath = "/tmp/conduit.patch";
    
    // Convert Buffer to base64 string - MUST ensure it's a string, not Buffer!
    const patchBase64 = patchBuffer.toString("base64");
    console.log(`[VM] Base64 type: ${typeof patchBase64}`);
    console.log(`[VM] Base64 encoded size: ${patchBase64.length} characters`);
    console.log(`[VM] Base64 sample (first 50 chars): ${patchBase64.slice(0, 50)}`);
    
    const requestBody = {
      path: patchPath,
      content: patchBase64,
      mode: 0o666,  // Make file readable/writable by everyone
      create_dirs: false,
    };
    
    console.log(`[VM] Content in requestBody type: ${typeof requestBody.content}`);
    
    const jsonBody = JSON.stringify(requestBody);
    console.log(`[VM] Request body size: ${jsonBody.length} bytes`);
    console.log(`[VM] Request body sample (first 200 chars): ${jsonBody.slice(0, 200)}`);
    
    const writeResponse = await apiCall<{ success: boolean; error?: string; message: string }>(
      `/vms/${vmId}/files/write`,
      {
        method: "POST",
        body: jsonBody,
      }
    );

    if (!writeResponse.success) {
      console.error(`[VM] Failed to write patch file:`, writeResponse.error);
      return {
        success: false,
        error: `Failed to write patch: ${writeResponse.error}`,
      };
    }

    console.log(`[VM] Patch file written to ${patchPath}`);

    // Step 2: Apply the patch using git apply with --3way for better handling of differences
    // --3way: attempt 3-way merge if patch doesn't apply cleanly
    // We don't use --index since we're applying to a clean working tree
    const applyCommand = `cd ${repoPath} && git apply --3way /tmp/conduit.patch && rm /tmp/conduit.patch`;

    const result = await executeInVM(vmId, "bash", ["-c", applyCommand], 60);

    if (result.exit_code !== 0) {
      console.error(`[VM] Failed to apply diff patch:`, result.stderr);
      return {
        success: false,
        error: result.stderr || result.error || "Unknown error applying patch",
      };
    }

    console.log(`[VM] Successfully applied diff patch`);
    if (result.stdout) {
      console.log(`[VM] Output:`, result.stdout);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[VM] Error applying diff to VM:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Reload configuration (useful after .env.local changes)
 */
export function reloadConfig(): void {
  reloadVMConfig();
}
