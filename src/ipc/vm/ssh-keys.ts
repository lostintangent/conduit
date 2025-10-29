import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * SSH Key management for Conduit VMs
 */

const KEYS_DIR = path.join(app.getAppPath(), "keys");
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, "id_rsa.pub");
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "id_rsa");

/**
 * Check if SSH keys exist in the keys folder
 */
export async function hasSSHKeys(): Promise<boolean> {
  try {
    await fs.access(PUBLIC_KEY_PATH);
    await fs.access(PRIVATE_KEY_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the public key content
 */
export async function getPublicKey(): Promise<string | null> {
  try {
    const content = await fs.readFile(PUBLIC_KEY_PATH, "utf-8");
    return content.trim();
  } catch (error) {
    console.error("[SSH] Failed to read public key:", error);
    return null;
  }
}

/**
 * Get the private key path for SSH client
 */
export function getPrivateKeyPath(): string {
  return PRIVATE_KEY_PATH;
}

/**
 * Setup SSH key in VM's authorized_keys
 */
export async function setupSSHKeyInVM(
  vmId: string,
  managerUrl: string,
  token: string
): Promise<boolean> {
  const publicKey = await getPublicKey();
  if (!publicKey) {
    console.log("[SSH] No public key found, skipping key setup");
    return false;
  }

  console.log("[SSH] Setting up SSH key in VM...");
  console.log("[SSH] Public key to install:", publicKey.substring(0, 50) + "...");

  try {
    // Ensure managerUrl ends with / for proper URL construction
    const baseUrl = managerUrl.endsWith("/") ? managerUrl : `${managerUrl}/`;
    
    // Use cat with here-string to append the key to authorized_keys
    // This is a single exec call that appends without needing to read first
    const execUrl = `${baseUrl}api/vms/${vmId}/exec`;
    console.log("[SSH] Sending exec request to:", execUrl);
    
    const response = await fetch(execUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        command: "bash",
        args: ["-c", `cat >> ~/.ssh/authorized_keys <<< '${publicKey}'`],
        timeout_seconds: 10,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[SSH] API error response:", text);
      throw new Error(`Failed to setup SSH key (${response.status}): ${text}`);
    }

    const result = await response.json();
    console.log("[SSH] Exec result:", result);
    
    if (result.exit_code !== 0) {
      console.error("[SSH] Command failed with exit code:", result.exit_code);
      console.error("[SSH] stderr:", result.stderr);
      throw new Error(
        `SSH key setup command failed: ${result.stderr || result.error}`
      );
    }

    console.log("[SSH] SSH key successfully appended to authorized_keys");
    return true;
  } catch (error) {
    console.error("[SSH] Failed to setup SSH key:", error);
    return false;
  }
}
