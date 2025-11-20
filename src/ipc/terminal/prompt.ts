import { ipcMain, type WebContents } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import type {
  TerminalPromptRequest,
  TerminalPromptResponse,
  TerminalPromptStreamChunk,
} from "../../shared/types";

// Track active prompt requests for cleanup
const activeRequests = new Map<string, ChildProcess>();

async function handlePromptRequest(
  request: TerminalPromptRequest,
  webContents: WebContents,
): Promise<TerminalPromptResponse> {
  const { prompt, agentCommand, sessionId } = request;

  if (!agentCommand) {
    return {
      success: false,
      error:
        "No agent command configured. Please configure 'terminalPromptAgent' in settings.",
    };
  }

  // Cancel any existing request for this session
  const existingProcess = activeRequests.get(sessionId);
  if (existingProcess && !existingProcess.killed) {
    existingProcess.kill("SIGTERM");
    activeRequests.delete(sessionId);
  }

  return new Promise((resolve) => {
    let resolved = false;

    const safeResolve = (response: TerminalPromptResponse) => {
      if (!resolved) {
        resolved = true;
        activeRequests.delete(sessionId);
        resolve(response);
      }
    };

    // Parse the command
    const parts = agentCommand.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (!parts || parts.length === 0) {
      safeResolve({
        success: false,
        error: "Invalid agent command format",
      });
      return;
    }

    const command = parts[0];
    let args: string[] = [];
    let useStdin = false;

    if (agentCommand.includes("{arg}")) {
      // Replace {arg} placeholder with the prompt passed as a direct argument
      // This avoids shell escaping since we pass args array to spawn
      args = parts.slice(1).map((arg) => {
        const cleaned = arg.replace(/^"|"$/g, "");
        return cleaned.replace(/\{arg\}/g, prompt);
      });
    } else {
      // No placeholder - use stdin
      args = parts.slice(1).map((arg) => arg.replace(/^"|"$/g, ""));
      useStdin = true;
    }

    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        shell: false, // Don't use shell to avoid parsing issues
        timeout: 60000, // 60 second timeout
      });
    } catch (error) {
      safeResolve({
        success: false,
        error: `Failed to spawn process: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    // Track this request for potential cancellation
    activeRequests.set(sessionId, child);

    // Write prompt to stdin if not using {arg}
    if (useStdin && child.stdin) {
      try {
        child.stdin.write(prompt);
        child.stdin.end();
      } catch (error) {
        // Ignore write errors - process may have already closed
      }
    }

    let stderrData = "";

    // Stream stdout with error handling
    if (child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
        if (webContents.isDestroyed()) {
          child.kill("SIGTERM");
          return;
        }

        const chunk: TerminalPromptStreamChunk = {
          type: "data",
          data: data.toString(),
        };
        webContents.send(`terminal:prompt:stream:${sessionId}`, chunk);
      });

      child.stdout.on("error", (error) => {
        // Log but don't fail - stdout errors are usually from broken pipe after kill
        console.error("stdout error:", error);
      });
    }

    // Collect stderr (but don't treat it as error unless exit code is non-zero)
    // Many tools write usage stats or progress to stderr
    if (child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        stderrData += data.toString();
      });

      child.stderr.on("error", (error) => {
        // Log but don't fail - stderr errors are usually from broken pipe after kill
        console.error("stderr error:", error);
      });
    }

    // Handle completion
    child.on("close", (code, signal) => {
      if (!webContents.isDestroyed()) {
        const endChunk: TerminalPromptStreamChunk = {
          type: "end",
        };
        webContents.send(`terminal:prompt:stream:${sessionId}`, endChunk);
      }

      if (signal === "SIGTERM" || signal === "SIGKILL") {
        safeResolve({
          success: false,
          error: "Request cancelled",
        });
      } else if (code !== 0) {
        // Only treat stderr as error if exit code is non-zero
        safeResolve({
          success: false,
          error: stderrData || `Process exited with code ${code}`,
        });
      } else {
        safeResolve({
          success: true,
        });
      }
    });

    // Handle spawn/execution errors
    child.on("error", (error) => {
      if (!webContents.isDestroyed()) {
        const errorChunk: TerminalPromptStreamChunk = {
          type: "error",
          error: error.message,
        };
        webContents.send(`terminal:prompt:stream:${sessionId}`, errorChunk);
      }

      safeResolve({
        success: false,
        error: error.message,
      });
    });

    // Timeout handler (spawn timeout doesn't always fire reliably)
    const timeoutId = setTimeout(() => {
      if (!resolved && !child.killed) {
        child.kill("SIGTERM");
        safeResolve({
          success: false,
          error: "Request timed out after 60 seconds",
        });
      }
    }, 60000);

    // Clear timeout on completion
    child.on("close", () => {
      clearTimeout(timeoutId);
    });
  });
}

// Cleanup function to kill all active requests
export function cleanupPromptRequests() {
  for (const [sessionId, process] of activeRequests.entries()) {
    if (!process.killed) {
      process.kill("SIGTERM");
    }
    activeRequests.delete(sessionId);
  }
}

export function initializePromptHandlers() {
  ipcMain.handle(
    "terminal:prompt",
    async (event, request: TerminalPromptRequest) => {
      return handlePromptRequest(request, event.sender);
    },
  );

  // Cleanup on app quit
  ipcMain.on("app:quit", () => {
    cleanupPromptRequests();
  });
}
