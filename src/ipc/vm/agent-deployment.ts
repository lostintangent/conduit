import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { addPortForward, executeInVM } from "./client";
import { loadConfig } from "./config";

/**
 * Deploy and start the Conduit file system agent on a VM
 * This is a temporary solution for testing - in production, the agent will be pre-installed in the VM image
 */
export async function deployFileSystemAgent(
  vmId: string,
): Promise<{ success: boolean; wsPort: number; error?: string }> {
  try {
    console.log(`[VM Agent] Deploying file system agent to VM ${vmId}...`);

    // Step 1: Create /conduit directory with proper permissions
    // First try to create it in home directory, then symlink to /conduit if we have sudo
    const createDirCmd = `
      if sudo -n true 2>/dev/null; then
        sudo mkdir -p /conduit/conduit-agent && sudo chown -R ace:ace /conduit
      else
        mkdir -p /home/ace/conduit/conduit-agent && ln -sf /home/ace/conduit /conduit 2>/dev/null || true
      fi
    `;
    const createDirResult = await executeInVM(
      vmId,
      "bash",
      ["-c", createDirCmd],
      "/",
      30,
    );

    if (createDirResult.exit_code !== 0) {
      throw new Error(
        `Failed to create agent directory: ${createDirResult.stderr}`,
      );
    }

    // Step 2: Deploy the bundled agent file
    // Handle different paths in dev vs prod
    let agentBundlePath = path.join(
      app.getAppPath(),
      "vm-agent",
      "bundle",
      "vm-agent.js",
    );
    if (!(await fs.stat(agentBundlePath).catch(() => false))) {
      // Try going up one level (common in dev/monorepo structures)
      agentBundlePath = path.join(
        app.getAppPath(),
        "..",
        "vm-agent",
        "bundle",
        "vm-agent.js",
      );
    }
    if (!(await fs.stat(agentBundlePath).catch(() => false))) {
      // Try going up two levels
      agentBundlePath = path.join(
        app.getAppPath(),
        "..",
        "..",
        "vm-agent",
        "bundle",
        "vm-agent.js",
      );
    }

    console.log(
      `[VM Agent] Deploying bundled agent from ${agentBundlePath}...`,
    );

    const agentContent = await fs.readFile(agentBundlePath);
    const agentBase64 = agentContent.toString("base64");

    const config = await loadConfig();
    const agentUrl = `${config.managerUrl.replace(/\/$/, "")}/api/vms/${vmId}/files/write`;

    const agentResponse = await fetch(agentUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "/conduit/conduit-agent/vm-agent.js",
        content: agentBase64,
        mode: 0o644,
        create_dirs: true,
      }),
    });

    if (!agentResponse.ok) {
      const text = await agentResponse.text();
      throw new Error(`Failed to write vm-agent.js: ${text}`);
    }

    const agentResult = (await agentResponse.json()) as {
      success: boolean;
      error?: string;
      message: string;
    };

    if (!agentResult.success) {
      throw new Error(`Failed to write vm-agent.js: ${agentResult.error}`);
    }

    console.log(`[VM Agent] Deployed vm-agent.js`);

    // Step 3: Create a startup script that installs only @parcel/watcher and starts the agent
    console.log(`[VM Agent] Creating startup script...`);
    const startupScript = `#!/bin/bash
set -e
cd /conduit/conduit-agent
echo "Installing @parcel/watcher..." > agent.log
npm install --no-save @parcel/watcher >>agent.log 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: npm install failed" >> agent.log
  exit 1
fi
echo "Starting agent..." >> agent.log
node vm-agent.js >>agent.log 2>&1 &
AGENT_PID=$!
# Wait a moment for the agent to start
sleep 1
# Check if process is still running
if kill -0 $AGENT_PID 2>/dev/null; then
  echo "Agent started with PID $AGENT_PID" >> agent.log
  echo $AGENT_PID
else
  echo "ERROR: Agent process died immediately" >> agent.log
  cat agent.log >&2
  exit 1
fi
`;

    const scriptBase64 = Buffer.from(startupScript).toString("base64");
    const scriptUrl = `${config.managerUrl.replace(/\/$/, "")}/api/vms/${vmId}/files/write`;

    const scriptResponse = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "/conduit/conduit-agent/start-agent.sh",
        content: scriptBase64,
        mode: 0o755, // Make it executable
        create_dirs: false,
      }),
    });

    if (!scriptResponse.ok) {
      const text = await scriptResponse.text();
      throw new Error(`Failed to write startup script: ${text}`);
    }

    console.log(`[VM Agent] Startup script created`);

    // Step 4: Execute the startup script and wait for it to complete
    console.log(`[VM Agent] Starting agent via startup script...`);

    let startResult;
    try {
      // Execute the script synchronously to get the PID
      startResult = await executeInVM(
        vmId,
        "bash",
        ["/conduit/conduit-agent/start-agent.sh"],
        "/conduit/conduit-agent",
        30, // Give it 30 seconds for npm install
      );
    } catch (error) {
      console.error(`[VM Agent] Failed to execute startup script:`, error);
      throw new Error(`Failed to start agent: ${error}`);
    }

    console.log(
      `[VM Agent] Startup script executed (exit code: ${startResult.exit_code})`,
    );

    // Always check the log for debugging
    if (startResult.stderr) {
      console.log(`[VM Agent] Startup stderr:`, startResult.stderr);
    }

    if (startResult.exit_code !== 0) {
      console.error(`[VM Agent] Startup failed. stderr:`, startResult.stderr);
      throw new Error(
        `Agent startup script failed with exit code ${startResult.exit_code}: ${startResult.stderr}`,
      );
    }

    // Get the PID from stdout
    const agentPid = startResult.stdout.trim();
    console.log(`[VM Agent] Agent started with PID: ${agentPid}`);

    // Step 5: Forward the WebSocket port (8765)
    console.log(`[VM Agent] Forwarding WebSocket port...`);
    const portForward = await addPortForward(
      vmId,
      8765,
      "Conduit File System Agent",
    );

    console.log(
      `[VM Agent] Agent deployed successfully. WebSocket URL: ws://${portForward.connection_url}`,
    );

    return {
      success: true,
      wsPort: parseInt(portForward.external_port, 10),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[VM Agent] Deployment failed:`, errorMessage);
    return {
      success: false,
      wsPort: 0,
      error: errorMessage,
    };
  }
}

/**
 * Check if the file system agent is running on a VM
 */
export async function isAgentRunning(vmId: string): Promise<boolean> {
  try {
    // Match "node vm-agent.js" running in the conduit-agent directory
    const checkCmd =
      "pgrep -f 'node.*vm-agent.js' | xargs -I{} pwdx {} | grep conduit-agent";
    const result = await executeInVM(vmId, "bash", ["-c", checkCmd], "/", 10);
    return result.exit_code === 0 && result.stdout.trim().length > 0;
  } catch (error) {
    console.error(`[VM Agent] Error checking agent status:`, error);
    return false;
  }
}

/**
 * Stop the file system agent on a VM
 */
export async function stopAgent(vmId: string): Promise<boolean> {
  try {
    // Kill the node process running the agent
    const stopCmd = "pkill -f 'node.*vm-agent.js'";
    const result = await executeInVM(
      vmId,
      "bash",
      ["-c", stopCmd],
      undefined,
      10,
    );
    return result.exit_code === 0;
  } catch (error) {
    console.error(`[VM Agent] Error stopping agent:`, error);
    return false;
  }
}
