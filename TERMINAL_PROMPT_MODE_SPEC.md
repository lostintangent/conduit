# Terminal Prompt Mode Feature Specification

## Overview

Add a Warp Terminal-style prompt mode feature that allows users to switch their focused terminal from terminal mode to prompt mode via `Cmd+P` keyboard shortcut. This mode enables users to ask contextual questions about their terminal session and receive LLM-powered assistance without executing commands.

## Goals

1. **Quick Context Switch**: Allow users to instantly switch from terminal mode to prompt mode with a keyboard shortcut
2. **Contextual Awareness**: Inject terminal buffer context into prompts so the LLM understands what the user is working on
3. **Configurable Agent**: Let users configure which agent command to use for processing prompts
4. **Non-Invasive**: Provide helpful information without executing commands or modifying terminal state
5. **Seamless Integration**: Integrate with existing Conduit architecture (keybindings, settings, IPC)

## User Experience

### Entering Prompt Mode

1. User has a terminal pane focused and presses `Cmd+P`
2. Terminal switches to "prompt mode":
   - Terminal input is disabled/dimmed
   - A prompt input overlay appears at the bottom of the terminal pane
   - The prompt input is focused and ready for user input
3. User types their question/prompt (e.g., "How do I setup a RAID array?", "What does this error mean?", "How to fix npm permission issues?")
4. User presses `Enter` to submit

### Processing the Prompt

1. System captures the last 100 lines of terminal buffer using the existing `SerializeAddon`
2. System constructs a prompt with:
   - System instructions explaining the context
   - Terminal buffer content (last 100 lines)
   - User's question
3. System invokes configured agent command with the constructed prompt
4. Response is displayed in an inline overlay or modal within the terminal pane
5. User can:
   - Read the response
   - Copy suggested commands
   - Close the response overlay to return to normal terminal mode

### Exiting Prompt Mode

- `Escape` key: Cancel/close prompt mode and return to normal terminal
- After receiving and closing the response: Return to normal terminal mode
- Clicking outside the prompt area: Cancel and return to normal terminal

## Technical Architecture

### 1. Terminal Mode State

**Location**: `src/renderer/types.ts` or new `src/renderer/components/panes/terminal/types.ts`

```typescript
export type TerminalMode = "normal" | "prompt";

export type TerminalPromptState = {
  mode: TerminalMode;
  promptValue?: string;
  isProcessing?: boolean;
  response?: string;
};
```

**State Management**:

- Add terminal-specific mode state to the terminal pane component
- Use React state or add to a Jotai atom if global state is needed

### 2. User Settings Extension

**Location**: `src/shared/types.ts`

Add to `UserSettings` type:

```typescript
export type UserSettings = {
  // ... existing fields

  // Terminal Prompt Mode settings
  terminalPromptAgent?: string; // Command to invoke (e.g., "claude", "chatgpt", "aider")
  terminalPromptBufferLines?: number; // Number of buffer lines to include (default: 100)
};
```

**Default Settings**: `src/ipc/ui/settings.ts`

```typescript
const defaultSettings = {
  // ... existing defaults
  terminalPromptAgent: undefined, // User must configure
  terminalPromptBufferLines: 100,
};
```

### 3. Keybinding Registration

**Location**: `src/renderer/commands/applicationCommands.ts`

Add new command:

```typescript
export const ApplicationCommands = {
  // ... existing commands

  // Terminal Prompt Mode
  TERMINAL_TOGGLE_PROMPT_MODE: "terminal.togglePromptMode",
} as const;
```

**Default Keybinding**: Register in command registry with `cmd+p` (macOS) / `ctrl+p` (Windows/Linux)

**Location**: `src/renderer/commands/handlers/terminalHandlers.ts`

Add handler:

```typescript
export async function handleTogglePromptMode(context: any): Promise<void> {
  // Get active terminal pane
  // Toggle prompt mode state
  // Focus prompt input if entering prompt mode
}
```

### 4. Terminal Buffer Capture

**Location**: `src/renderer/components/panes/terminal/xtermCache.ts`

Extend existing serialization capability:

```typescript
export function getTerminalBuffer(
  sessionId: string,
  lines: number = 100,
): string | null {
  const instance = store.get(sessionId);
  if (!instance) {
    return null;
  }

  try {
    // Use SerializeAddon to get last N lines
    const fullBuffer = instance.serializer.serialize();
    const bufferLines = fullBuffer.split("\n");
    const lastNLines = bufferLines.slice(-lines);
    return lastNLines.join("\n");
  } catch (error) {
    console.error("Failed to capture terminal buffer", error);
    return null;
  }
}
```

### 5. Prompt Construction

**Location**: New file `src/renderer/utils/terminalPrompt.ts`

```typescript
export function constructPrompt(
  userPrompt: string,
  terminalBuffer: string,
  cwd: string | null,
): string {
  const systemInstructions = `You are a helpful terminal assistant. The user is working in a command-line environment and needs your help.

IMPORTANT CONTEXT:
- The user is currently in a terminal session
- Current working directory: ${cwd || "unknown"}
- The last 100 lines of their terminal buffer are shown below
- The user is looking for INFORMATION and GUIDANCE, not action
- DO NOT execute commands or modify their system
- Provide clear, concise answers focused on command-line solutions
- If suggesting commands, explain what they do
- Consider the context from their terminal buffer to give relevant advice

TERMINAL BUFFER (last 100 lines):
\`\`\`
${terminalBuffer}
\`\`\`

USER QUESTION:
${userPrompt}

Please provide a helpful answer that considers their current terminal context.`;

  return systemInstructions;
}
```

### 6. Agent Invocation

**Location**: New file `src/ipc/terminal/prompt.ts`

```typescript
import { ipcMain } from "electron";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface PromptRequest {
  sessionId: string;
  prompt: string;
  agentCommand: string;
}

export interface PromptResponse {
  success: boolean;
  response?: string;
  error?: string;
}

async function handlePromptRequest(
  request: PromptRequest,
): Promise<PromptResponse> {
  const { prompt, agentCommand } = request;

  if (!agentCommand) {
    return {
      success: false,
      error:
        "No agent command configured. Please set 'terminalPromptAgent' in settings.",
    };
  }

  try {
    // Escape prompt for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // Execute agent command with prompt as stdin or argument
    // This depends on the agent's CLI interface
    const command = `echo '${escapedPrompt}' | ${agentCommand}`;

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
  ipcMain.handle("terminal:prompt", async (_event, request: PromptRequest) => {
    return handlePromptRequest(request);
  });
}
```

Update `src/ipc/terminal/index.ts` to include prompt handlers:

```typescript
import { initializePromptHandlers } from "./prompt";

export function initializeTerminalHandlers(sendToRenderer: SendToRendererFn) {
  // ... existing handlers
  initializePromptHandlers();
}
```

### 7. Prompt Mode UI Component

**Location**: New file `src/renderer/components/panes/terminal/PromptModeOverlay.tsx`

```typescript
import React, { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";

interface PromptModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  isProcessing: boolean;
  response?: string;
  error?: string;
}

export const PromptModeOverlay: React.FC<PromptModeOverlayProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isProcessing,
  response,
  error,
}) => {
  const [promptValue, setPromptValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (promptValue.trim() && !isProcessing) {
      onSubmit(promptValue.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-surface/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-sm font-medium text-foreground">
          Terminal Assistant (Prompt Mode)
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-surfaceMuted rounded transition-colors"
          aria-label="Close prompt mode"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Response Area */}
      {(response || error || isProcessing) && (
        <div className="flex-1 overflow-auto p-4">
          {isProcessing && (
            <div className="flex items-center gap-2 text-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Processing your request...</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}

          {response && (
            <div className="prose prose-invert prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-foreground bg-surfaceMuted p-3 rounded border border-border">
                {response}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Prompt Input */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your terminal session... (e.g., 'How do I setup a RAID array?')"
              className="flex-1 px-3 py-2 bg-input border border-border rounded text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent"
              disabled={isProcessing}
            />
            <button
              type="submit"
              disabled={!promptValue.trim() || isProcessing}
              className="px-4 py-2 bg-accent text-foregroundInverse rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {isProcessing ? "Processing..." : "Ask"}
            </button>
          </div>
          <div className="mt-2 text-xs text-foreground/60">
            Press <kbd className="px-1 py-0.5 bg-surfaceMuted border border-border rounded">Escape</kbd> to close
          </div>
        </form>
      </div>
    </div>
  );
};
```

### 8. Integration into TerminalPane

**Location**: `src/renderer/components/panes/terminal/TerminalPane.tsx`

Add state and handlers:

```typescript
const [promptMode, setPromptMode] = useState<{
  isOpen: boolean;
  isProcessing: boolean;
  response?: string;
  error?: string;
}>({
  isOpen: false,
  isProcessing: false,
});

const handleTogglePromptMode = useCallback(() => {
  setPromptMode((prev) => ({
    ...prev,
    isOpen: !prev.isOpen,
    response: undefined,
    error: undefined,
  }));
}, []);

const handlePromptSubmit = useCallback(
  async (prompt: string) => {
    const settings = userSettingsAtom; // Access from atom
    const agentCommand = settings.terminalPromptAgent;

    if (!agentCommand) {
      setPromptMode((prev) => ({
        ...prev,
        error:
          "No agent command configured. Please configure 'terminalPromptAgent' in settings.",
      }));
      return;
    }

    setPromptMode((prev) => ({
      ...prev,
      isProcessing: true,
      error: undefined,
    }));

    // Get terminal buffer
    const buffer = getTerminalBuffer(
      terminalId,
      settings.terminalPromptBufferLines || 100,
    );

    // Get CWD from pane data (passed as prop or from context)
    const cwd = getCurrentCwd(); // Implementation needed

    // Construct full prompt
    const fullPrompt = constructPrompt(prompt, buffer || "", cwd);

    // Call IPC handler
    const response = await api.promptTerminal({
      sessionId: terminalId,
      prompt: fullPrompt,
      agentCommand,
    });

    setPromptMode((prev) => ({
      ...prev,
      isProcessing: false,
      response: response.success ? response.response : undefined,
      error: response.success ? undefined : response.error,
    }));
  },
  [terminalId],
);
```

Register keyboard handler in `registerTerminalKeyHandler`:

```typescript
// Add to keyHandler function
if (
  isCtrlOrMeta &&
  !event.shiftKey &&
  !event.altKey &&
  event.key.toLowerCase() === "p"
) {
  event.preventDefault();
  handleTogglePromptMode();
  return false;
}
```

Add overlay to render:

```tsx
<PromptModeOverlay
  isOpen={promptMode.isOpen}
  onClose={() => setPromptMode((prev) => ({ ...prev, isOpen: false }))}
  onSubmit={handlePromptSubmit}
  isProcessing={promptMode.isProcessing}
  response={promptMode.response}
  error={promptMode.error}
/>
```

### 9. Window API Extension

**Location**: `src/preload.ts`

Add IPC method:

```typescript
export interface ConduitAPI {
  // ... existing methods

  promptTerminal: (request: {
    sessionId: string;
    prompt: string;
    agentCommand: string;
  }) => Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }>;
}
```

Implement in preload:

```typescript
promptTerminal: (request) => ipcRenderer.invoke("terminal:prompt", request),
```

### 10. Settings UI

Add settings fields in the Settings UI component (wherever user settings are edited):

```typescript
// Terminal Prompt Mode Section
<div className="space-y-2">
  <h3 className="font-medium">Terminal Prompt Mode</h3>

  <div>
    <label htmlFor="prompt-agent" className="text-sm">
      Agent Command
    </label>
    <input
      id="prompt-agent"
      type="text"
      value={settings.terminalPromptAgent || ""}
      onChange={(e) => updateSetting("terminalPromptAgent", e.target.value)}
      placeholder="e.g., claude, chatgpt, aider"
      className="w-full px-3 py-2 bg-input border border-border rounded"
    />
    <p className="text-xs text-foreground/60 mt-1">
      The CLI command to invoke when processing prompts (e.g., "claude", "openai chat")
    </p>
  </div>

  <div>
    <label htmlFor="prompt-buffer-lines" className="text-sm">
      Terminal Buffer Lines
    </label>
    <input
      id="prompt-buffer-lines"
      type="number"
      min="10"
      max="1000"
      value={settings.terminalPromptBufferLines || 100}
      onChange={(e) => updateSetting("terminalPromptBufferLines", parseInt(e.target.value))}
      className="w-full px-3 py-2 bg-input border border-border rounded"
    />
    <p className="text-xs text-foreground/60 mt-1">
      Number of terminal buffer lines to include as context (default: 100)
    </p>
  </div>
</div>
```

## Implementation Phases

### Phase 1: Core Infrastructure (MVP)

- [ ] Add terminal mode state types
- [ ] Add user settings for agent command and buffer lines
- [ ] Implement terminal buffer capture function
- [ ] Implement prompt construction utility
- [ ] Add IPC handler for prompt processing
- [ ] Register `Cmd+P` keybinding

### Phase 2: UI Components

- [ ] Create PromptModeOverlay component
- [ ] Integrate overlay into TerminalPane
- [ ] Handle keyboard events (Cmd+P, Escape)
- [ ] Add loading/processing states
- [ ] Error handling and display

### Phase 3: Settings & Configuration

- [ ] Add settings UI fields
- [ ] Persist settings to disk
- [ ] Validate agent command configuration
- [ ] Add helpful error messages for unconfigured state

### Phase 4: Polish & Enhancements

- [ ] Add syntax highlighting for code in responses
- [ ] Support copying suggested commands to clipboard
- [ ] Support copying commands directly to terminal input
- [ ] Add keyboard shortcuts for common actions in response view
- [ ] Add history of recent prompts
- [ ] Support for different agent response formats (JSON, markdown, plain text)

## Alternative Agent Integration Approaches

### Option A: Pipe to stdin (Current spec)

```bash
echo "prompt text" | claude
```

**Pros**: Simple, works with many CLI tools
**Cons**: May not work with all agents, limited argument passing

### Option B: File-based input

```bash
echo "prompt text" > /tmp/prompt.txt
claude --input /tmp/prompt.txt
```

**Pros**: Handles large prompts, avoids shell escaping issues
**Cons**: More file I/O, cleanup needed

### Option C: Direct argument passing

```bash
claude "prompt text here"
```

**Pros**: Most direct
**Cons**: Shell escaping complex, length limits

**Recommendation**: Start with Option A (stdin), make agent invocation configurable in future

## Edge Cases & Considerations

1. **No agent configured**: Show helpful error with link to settings
2. **Agent command not found**: Show clear error message
3. **Agent timeout**: Implement timeout (60s) with cancellation option
4. **Large responses**: Handle with scrollable container, consider streaming in future
5. **Terminal buffer contains sensitive data**: Consider adding option to disable buffer capture
6. **Concurrent prompt requests**: Queue or cancel previous request
7. **Terminal is in TUI mode**: Should still work, captures visible buffer
8. **Cloud/remote terminals**: Works the same, buffer is local to xterm instance

## Testing Considerations

1. **Unit Tests**:
   - Prompt construction with various buffer content
   - Buffer capture edge cases (empty, very long, special characters)
   - Settings validation

2. **Integration Tests**:
   - Keybinding triggers prompt mode
   - Escape closes prompt mode
   - Submit sends request and displays response
   - Error handling flows

3. **Manual Testing Scenarios**:
   - Test with different agent commands (if available)
   - Test with various terminal states (idle, running command, TUI)
   - Test buffer capture accuracy
   - Test keyboard navigation and accessibility

## Future Enhancements

1. **Prompt History**: Save recent prompts for quick re-use
2. **Response Actions**: Quick actions like "Copy to clipboard", "Paste to terminal", "Run command"
3. **Streaming Responses**: Real-time streaming of agent responses
4. **Multi-turn Conversations**: Keep context for follow-up questions
5. **Custom System Prompts**: Allow users to customize the system instructions
6. **Agent Presets**: Built-in configurations for popular CLI agents
7. **Inline Suggestions**: Show suggestions as you type based on buffer context
8. **Response Formatting**: Better rendering of markdown, code blocks, tables
9. **Terminal Awareness**: Detect running processes and adjust context accordingly
10. **Privacy Mode**: Option to exclude certain patterns from buffer capture

## Documentation Updates Needed

1. **README.md**: Add section about Terminal Prompt Mode feature
2. **User Guide**: How to configure agent command
3. **Examples**: Sample agent commands for popular LLM CLIs
4. **Troubleshooting**: Common issues and solutions

## Success Metrics

1. Feature is successfully invoked with `Cmd+P`
2. Terminal buffer is accurately captured
3. Agent receives properly formatted prompt
4. Response is displayed in overlay
5. User can exit prompt mode and return to normal terminal
6. Settings persist across sessions
7. Error states are handled gracefully

## Open Questions

1. Should we support multiple agent profiles (e.g., different agents for different purposes)?
2. Should responses be logged/saved for later reference?
3. Should we support custom prompt templates?
4. Should there be a global shortcut vs. per-terminal shortcut?
5. How should we handle very long agent responses (pagination, truncation)?
6. Should we integrate with existing notification system for long-running requests?

## Dependencies

- No new external dependencies required
- Uses existing xterm.js SerializeAddon
- Uses existing IPC infrastructure
- Uses existing settings system
- Uses existing keybinding system

## Security Considerations

1. **Command Injection**: Properly escape all user input and buffer content before passing to shell
2. **Sensitive Data**: Terminal buffer may contain passwords, API keys, etc. - consider warning users
3. **Agent Command Validation**: Validate agent command exists and is executable
4. **Resource Limits**: Implement timeouts and max buffer sizes to prevent abuse
5. **Sandboxing**: Agent command runs in same environment as terminal, consider implications

## Accessibility

1. Keyboard-only navigation for entire flow
2. Screen reader announcements for mode changes
3. Focus management when entering/exiting prompt mode
4. ARIA labels for all interactive elements
5. High contrast support in overlay

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-14  
**Author**: Specification created based on Conduit codebase analysis
