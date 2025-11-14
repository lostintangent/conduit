import { ipcMain } from "electron";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  TerminalPromptRequest,
  TerminalPromptResponse,
} from "../../shared/types";

const execAsync = promisify(exec);

async function handlePromptRequest(
  request: TerminalPromptRequest,
): Promise<TerminalPromptResponse> {
  const { prompt, agentCommand } = request;

  if (!agentCommand) {
    return {
      success: false,
      error:
        "No agent command configured. Please configure 'terminalPromptAgent' in settings.",
    };
  }

  try {
    // Escape prompt for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // Check if the command uses {arg} placeholder, otherwise use stdin
    let command: string;
    if (agentCommand.includes("{arg}")) {
      // Replace {arg} placeholder with the quoted prompt
      command = agentCommand.replace(/\{arg\}/g, `'${escapedPrompt}'`);
    } else {
      // Fallback to piping through stdin for backwards compatibility
      command = `echo '${escapedPrompt}' | ${agentCommand}`;
    }

    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large responses
      timeout: 60000, // 60 second timeout
    });

    if (stderr && !stdout) {
      return {
        success: false,
        error: stderr,
      };
    }

    return {
      success: true,
      response: stdout || stderr,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function initializePromptHandlers() {
  ipcMain.handle(
    "terminal:prompt",
    async (_event, request: TerminalPromptRequest) => {
      return handlePromptRequest(request);
    },
  );
}
