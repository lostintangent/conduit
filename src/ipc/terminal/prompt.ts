import { ipcMain, type WebContents } from "electron";
import { spawn } from "node:child_process";
import type {
  TerminalPromptRequest,
  TerminalPromptResponse,
  TerminalPromptStreamChunk,
} from "../../shared/types";

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

  return new Promise((resolve) => {
    // Parse the command
    const parts = agentCommand.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const command = parts[0] || "";
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

    const child = spawn(command, args, {
      shell: false, // Don't use shell to avoid parsing issues
      timeout: 60000, // 60 second timeout
    });

    // Write prompt to stdin if not using {arg}
    if (useStdin && child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    let stderrData = "";

    // Stream stdout
    child.stdout?.on("data", (data: Buffer) => {
      const chunk: TerminalPromptStreamChunk = {
        type: "data",
        data: data.toString(),
      };
      webContents.send(`terminal:prompt:stream:${sessionId}`, chunk);
    });

    // Collect stderr (but don't treat it as error unless exit code is non-zero)
    // Many tools write usage stats or progress to stderr
    child.stderr?.on("data", (data: Buffer) => {
      stderrData += data.toString();
    });

    // Handle completion
    child.on("close", (code) => {
      const endChunk: TerminalPromptStreamChunk = {
        type: "end",
      };
      webContents.send(`terminal:prompt:stream:${sessionId}`, endChunk);

      if (code !== 0) {
        // Only treat stderr as error if exit code is non-zero
        resolve({
          success: false,
          error: stderrData || `Process exited with code ${code}`,
        });
      } else {
        resolve({
          success: true,
        });
      }
    });

    // Handle errors
    child.on("error", (error) => {
      const errorChunk: TerminalPromptStreamChunk = {
        type: "error",
        error: error.message,
      };
      webContents.send(`terminal:prompt:stream:${sessionId}`, errorChunk);

      resolve({
        success: false,
        error: error.message,
      });
    });
  });
}

export function initializePromptHandlers() {
  ipcMain.handle(
    "terminal:prompt",
    async (event, request: TerminalPromptRequest) => {
      return handlePromptRequest(request, event.sender);
    },
  );
}
