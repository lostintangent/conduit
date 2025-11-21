# Multi-Launch Mode Specification

**Status:** Draft Specification  
**Created:** 2025-11-21  
**Feature:** Multi-agent parallel task execution via Cmd+I prompt mode

## Overview

Multi-launch mode allows users to spawn a prompt that will simultaneously launch multiple AI coding agents, each in their own isolated git worktree/agent session pane. This enables parallel execution of the same task across different agents for comparison, redundancy, or collaborative workflows.

## Current System Capabilities

### Pane Management

**Pane Creation:**

- `splitPane()` - Split existing pane horizontally or vertically
- `splitPaneWithAgentSession()` - Split pane and create new agent session in isolated git worktree
- `openEditorPane()` - Create new editor pane
- `openWebViewPane()` - Create new webview pane

**Pane Organization:**

- `movePane()` - Move pane in direction (up/down/left/right)
- `closePane()` - Remove pane and cleanup layout tree
- `setPaneCollapsed()` - Collapse pane to thin bar (25px)
- `detachPane()` - Remove pane for drag-and-drop operations
- `activatePane()` - Set pane as focused/active

**Layout Structure:**

- Tree-based layout with split nodes (containers) and pane nodes (leaves)
- Supports arbitrary nesting and complex arrangements
- CSS Grid rendering for dynamic layouts
- Automatic tree simplification on pane removal

### Agent Sessions & Worktrees

**Agent Session Creation:**

- Creates isolated git worktrees in `~/.conduit/worktrees/<repo>/<timestamp-id>/`
- Each session gets unique branch name (e.g., `conduit/agent-20250121-abc123`)
- Sessions tracked in memory map with metadata:
  - `id` - Unique session identifier
  - `repoRoot` - Original repository root
  - `worktreePath` - Isolated worktree directory
  - `branchName` - Git branch for this session
  - `baseRef` - Commit SHA session was created from
  - `baseBranch` - Original branch name
  - `createdAt` - Timestamp

**Session Lifecycle:**

- `spawnAgentSession()` - Create new worktree and session
- `completeAgentSession()` - Merge changes back and cleanup
- `deleteAgentSession()` - Remove worktree without merging
- Sessions persist across app restarts (loaded from disk)

**Terminal Integration:**

- Terminal panes can be linked to agent sessions via `agentSessionId`
- Terminals automatically start in worktree directory
- Session metadata displayed in terminal UI

### Tab & Workspace Management

**Tab Operations:**

- `openTab()` - Create new tab
- `closeTab()` - Remove tab and cleanup all panes
- `duplicateTab()` - Clone tab with all panes
- `duplicateTabIntoWorktree()` - Clone tab into new agent session
- `lockTab()` / `unlockTab()` - Prevent/allow modifications
- `movePaneToTab()` - Move pane between tabs

**Layout Modes:**

- **Normal Mode** - Standard multi-pane layout with 1px gaps
- **Focus Mode** - Fullscreen single pane (Cmd+Shift+F)
- **Design Mode** - Layout reorganization with drag handles
- **Overview Mode** - Grid preview of all tabs

### Prompt Mode (Cmd+P)

**Current Implementation:**

- Terminal-focused prompt overlay
- Invokes single AI agent with terminal buffer context
- Agent selection via slash commands (e.g., `/claude`, `/codex`)
- Default agent used when no slash command specified
- Terminal buffer (last N lines) included as context
- Buffer line count configurable per agent (default: 100)

**Agent Configuration:**

```typescript
type AgentConfig = {
  id: string; // Slash command ID (e.g., "claude")
  name: string; // Display name (e.g., "Claude")
  command: string; // Execution command with {arg} placeholder
  launchCommand?: string; // NEW: Auto-launch command for multilaunch
  isDefault?: boolean; // Use when no slash command
};
```

**Agent Execution:**

- Command template: `copilot -p {arg}` → `copilot -p "user prompt here"`
- `{arg}` placeholder replaced with user prompt
- Executed in terminal's current working directory
- Terminal buffer context provided to agent

## Multi-Launch Mode Requirements

### User Experience

**Activation:**

- **Keybinding:** Cmd+I when focused on a terminal pane
- Opens special "multi-launch prompt" modal overlay
- Distinct visual style from regular Cmd+P prompt mode
- Modal shows which agents will be launched (based on configuration)

**Prompt Input:**

- Single text input field for task description
- Visual indicators showing:
  - Number of agents that will be launched
  - Agent names/IDs that will receive the prompt
  - Estimated layout (e.g., "Will create 3 panes in horizontal split")
- Enter key submits and initiates multi-launch
- Escape key cancels

**Execution Flow:**

1. User hits Cmd+I on terminal pane
2. Multi-launch prompt modal appears
3. User types task description
4. User presses Enter
5. System creates N new panes (one per selected agent)
6. Each pane gets its own agent session/worktree
7. Launch commands execute automatically in each terminal
8. Panes arranged in optimal layout

**Layout Strategy:**

- For 2 agents: Vertical split (side-by-side)
- For 3 agents: One top row, two bottom (or vice versa)
- For 4 agents: 2x2 grid
- For 5+ agents: Best-fit grid arrangement
- Original focused pane remains visible (option to hide/collapse it?)

### Agent Configuration Extension

**New Settings in Agents Editor:**

Add new section: "Multi-Launch Configuration"

```typescript
type AgentConfig = {
  id: string;
  name: string;
  command: string;
  launchCommand?: string; // NEW: Command template for auto-launch
  enabledForMultiLaunch?: boolean; // NEW: Include in multi-launch
  isDefault?: boolean;
};
```

**UI Changes to AgentsEditor.tsx:**

1. **Edit Mode - Add new field after `command`:**
   - Label: "Launch Command (for auto-launch)"
   - Input: Text field with placeholder `codex {arg}`
   - Help text: "Command to auto-execute with prompt. Use {arg} as placeholder."
   - Example: `codex {arg}` becomes `codex "implement feature X"`

2. **Edit Mode - Add new checkbox:**
   - Label: "Enable for Multi-Launch (Cmd+I)"
   - Checkbox: `enabledForMultiLaunch`
   - Help text: "Include this agent when using multi-launch mode"

3. **View Mode - Display indicators:**
   - Show badge if `enabledForMultiLaunch` is true
   - Show launch command if configured

**Example Configurations:**

```javascript
// Codex agent with multi-launch
{
  id: "codex",
  name: "Codex",
  command: "codex -p {arg}",           // For Cmd+P prompt mode
  launchCommand: "codex {arg}",        // For Cmd+I multi-launch
  enabledForMultiLaunch: true,
  isDefault: false
}

// Claude agent with multi-launch
{
  id: "claude",
  name: "Claude",
  command: "claude --prompt {arg}",
  launchCommand: "claude {arg}",
  enabledForMultiLaunch: true,
  isDefault: true
}

// GitHub Copilot (prompt only, no multi-launch)
{
  id: "copilot",
  name: "GitHub Copilot",
  command: "gh copilot suggest -t shell '{arg}'",
  launchCommand: undefined,
  enabledForMultiLaunch: false,  // Excluded from multi-launch
  isDefault: false
}
```

### Technical Implementation

**New Files to Create:**

1. **`src/renderer/components/shell/MultiLaunchPrompt.tsx`**
   - Modal component for multi-launch prompt
   - Shows agent list and layout preview
   - Handles prompt submission

2. **`src/renderer/utils/multiLaunchLayout.ts`**
   - Layout calculation algorithms
   - Grid arrangement strategies
   - Pane creation coordination

3. **`src/renderer/store/actions/multiLaunch.ts`**
   - Core multi-launch orchestration
   - Agent session spawning
   - Command execution

**Modified Files:**

1. **`src/shared/types.ts`**
   - Add `launchCommand?: string` to `AgentConfig`
   - Add `enabledForMultiLaunch?: boolean` to `AgentConfig`

2. **`src/renderer/components/shell/agents/AgentsEditor.tsx`**
   - Add UI fields for launch command
   - Add UI checkbox for multi-launch enablement
   - Display multi-launch status in view mode

3. **`src/renderer/commands/applicationCommands.ts`**
   - Register `MULTILAUNCH_PROMPT` command
   - Bind to Cmd+I keybinding
   - Context: terminal pane must be focused

4. **`src/shared/commands.ts`**
   - Add `MULTILAUNCH_PROMPT` command ID

**Core Algorithm:**

```typescript
async function executeMultiLaunch(
  sourceTabId: string,
  sourcePaneId: string,
  prompt: string,
): Promise<void> {
  // 1. Get enabled agents
  const settings = await getSettings();
  const enabledAgents = settings.agents.filter(
    (a) => a.enabledForMultiLaunch && a.launchCommand,
  );

  if (enabledAgents.length === 0) {
    showNotification("No agents enabled for multi-launch");
    return;
  }

  // 2. Get source pane context
  const sourcePane = getPane(sourceTabId, sourcePaneId);
  const cwd = sourcePane.type === "terminal" ? sourcePane.cwd : null;

  if (!cwd) {
    showNotification("Cannot determine working directory");
    return;
  }

  // 3. Calculate layout
  const layout = calculateMultiLaunchLayout(
    sourceTabId,
    sourcePaneId,
    enabledAgents.length,
  );

  // 4. Create agent sessions and panes
  const sessions = [];
  for (const agent of enabledAgents) {
    // Create isolated worktree
    const session = await spawnAgentSession({ cwd });
    sessions.push({ agent, session });
  }

  // 5. Create panes according to layout
  let currentPaneId = sourcePaneId;
  for (let i = 0; i < sessions.length; i++) {
    const { agent, session } = sessions[i];
    const layoutInfo = layout[i];

    // Split and create new pane
    await splitPane(
      sourceTabId,
      currentPaneId,
      layoutInfo.direction,
      layoutInfo.insertBefore,
      {
        terminalOptions: { cwd: session.worktreePath },
        agentSession: session,
      },
    );

    // Get the newly created pane
    const newPaneId = getLastCreatedPaneId(sourceTabId);

    // Execute launch command
    const command = agent.launchCommand.replace("{arg}", `"${prompt}"`);
    await executeInTerminal(newPaneId, command);

    // Use new pane as anchor for next split
    currentPaneId = newPaneId;
  }
}
```

**Layout Calculation Examples:**

```typescript
// 2 agents: Horizontal split
// ┌──────────┬──────────┐
// │ Agent 1  │ Agent 2  │
// └──────────┴──────────┘

// 3 agents: T-shape
// ┌─────────────────────┐
// │      Agent 1        │
// ├──────────┬──────────┤
// │ Agent 2  │ Agent 3  │
// └──────────┴──────────┘

// 4 agents: Grid
// ┌──────────┬──────────┐
// │ Agent 1  │ Agent 2  │
// ├──────────┼──────────┤
// │ Agent 3  │ Agent 4  │
// └──────────┴──────────┘
```

**Command Execution:**

```typescript
async function executeInTerminal(
  paneId: string,
  command: string,
): Promise<void> {
  // Get terminal session for pane
  const pane = getPaneById(paneId);
  if (pane.type !== "terminal") return;

  // Write command to terminal
  await api.terminal.sendInput(pane.sessionId, command + "\n");
}
```

### Settings & Preferences

**User Settings (stored in settings):**

```typescript
type UserSettings = {
  // ... existing settings
  multiLaunchLayout?: "auto" | "grid" | "rows" | "columns";
  multiLaunchCollapseSource?: boolean; // Collapse source pane after launch
  multiLaunchAutoActivate?: boolean; // Auto-focus first launched agent
};
```

**Agent-Level Settings (per agent in agents array):**

```typescript
type AgentConfig = {
  id: string;
  name: string;
  command: string;
  launchCommand?: string;
  enabledForMultiLaunch?: boolean;
  multiLaunchPriority?: number; // Optional: Order in layout (1-N)
  isDefault?: boolean;
};
```

### Context & Constraints

**Terminal Buffer Context:**

- Include terminal buffer context with launch command?
- Use same `terminalPromptBufferLines` setting as Cmd+P?
- Options:
  - **Option A:** Auto-prepend buffer to prompt
  - **Option B:** Make it available as env var
  - **Option C:** Don't include (agent tool can access if needed)

**Git Repository Requirements:**

- Multi-launch requires git repository (same as single agent session)
- Show clear error if not in git repo
- Consider: Allow multi-launch without worktrees for agents that don't need isolation?

**Resource Limits:**

- Maximum simultaneous agents (suggest 6-8 practical limit)
- Warning if too many agents enabled
- Performance considerations for many git worktrees

**Error Handling:**

- If any worktree creation fails, should we:
  - **Option A:** Abort entire multi-launch
  - **Option B:** Continue with successful ones, show errors
  - **Option C:** Retry failed ones with delay
- Cleanup on failure (remove partial worktrees)

### User Interface Details

**Multi-Launch Prompt Modal:**

```
┌─────────────────────────────────────────────┐
│  Multi-Launch Prompt                     × │
├─────────────────────────────────────────────┤
│                                             │
│  Enter task for all agents:                │
│  ┌─────────────────────────────────────┐   │
│  │ Implement user authentication       │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ✓ Codex                                    │
│  ✓ Claude                                   │
│  ✓ Aider                                    │
│                                             │
│  Will create 3 panes in grid layout         │
│                                             │
│           [Cancel]  [Launch (Enter)]        │
└─────────────────────────────────────────────┘
```

**Visual Feedback During Launch:**

- Progress indicator showing session creation
- Status updates as each agent launches
- Notification on completion or errors

**Agents Editor - Multi-Launch Section:**

```
┌─────────────────────────────────────────────┐
│  Multi-Launch Configuration                │
├─────────────────────────────────────────────┤
│                                             │
│  Enabled Agents: 3                          │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ ☑ Codex      codex {arg}           │   │
│  │ ☑ Claude     claude {arg}          │   │
│  │ ☐ Copilot    (no launch cmd)       │   │
│  │ ☑ Aider      aider {arg}           │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Layout Strategy: [Auto ▼]                 │
│  ☑ Collapse source pane after launch       │
│  ☐ Auto-activate first agent                │
└─────────────────────────────────────────────┘
```

## Future Enhancements

**Phase 2 - Advanced Features:**

- Agent-specific context/instructions per launch
- Different prompts per agent (customization modal)
- Multi-launch templates/presets
- Result aggregation view
- Side-by-side diff comparison
- Voting/ranking of agent outputs

**Phase 3 - Collaboration:**

- Shared multi-launch sessions
- Team templates
- Result sharing/export
- Agent performance metrics

**Phase 4 - Orchestration:**

- Sequential vs parallel execution modes
- Agent dependencies (A must complete before B)
- Conditional launches based on results
- Agent voting/consensus mechanisms

## Open Questions

1. **Prompt Quoting:** Should we auto-quote the prompt or let launch command handle it?
   - Current spec: Auto-quote `{arg}` → `"prompt here"`
   - Alternative: Raw substitution, agent command handles quoting

2. **Source Pane:** What happens to the original terminal pane?
   - Option A: Keep it, collapse it, or remove it
   - Option B: Make it configurable
   - Recommendation: **Option B** - Add `multiLaunchCollapseSource` setting

3. **Pane Ordering:** Should agents launch in specific order?
   - Option A: Config file order
   - Option B: Add `multiLaunchPriority` field
   - Option C: Alphabetical by name
   - Recommendation: **Option A** with Option B as future enhancement

4. **Keyboard Navigation:** After launch, which pane gets focus?
   - Option A: First launched agent
   - Option B: Last launched agent
   - Option C: Keep focus on source
   - Recommendation: **Option A** with `multiLaunchAutoActivate` setting

5. **Launch Command Validation:** Should we validate launch commands?
   - Check if command exists in PATH?
   - Dry-run before creating worktrees?
   - Show warnings for potentially invalid commands?

6. **Tab Behavior:** Should multi-launch create new tab or use current?
   - Option A: Always current tab
   - Option B: Always new tab
   - Option C: User configurable
   - Recommendation: **Option A** initially, **Option C** as enhancement

## Success Criteria

**Minimal Viable Product (MVP):**

- [ ] Cmd+I keybinding triggers multi-launch prompt on terminal pane
- [ ] Modal shows enabled agents and layout preview
- [ ] User can enter single prompt for all agents
- [ ] System creates one worktree per enabled agent
- [ ] Launch commands execute automatically in each terminal
- [ ] Panes arranged in sensible layout (2-4 agents)
- [ ] Agent Editor includes multi-launch configuration
- [ ] Error handling for git repo requirements

**Polish:**

- [ ] Smooth transitions and visual feedback
- [ ] Progress indicators during session creation
- [ ] Helpful error messages
- [ ] Settings for layout preferences
- [ ] Support for 5+ agents with optimal layouts

**Documentation:**

- [ ] User guide for multi-launch mode
- [ ] Agent configuration examples
- [ ] Troubleshooting guide
- [ ] Video demo/walkthrough

## Implementation Phases

**Phase 1: Foundation** ✅ COMPLETE

- Add `launchCommand` property to `AgentConfig` type ✅
- Add `enabledForMultiLaunch` property to `AgentConfig` type ✅
- Update Agent Editor UI to configure launch commands ✅
- Add multi-launch checkbox to Agent Editor ✅
- Display multi-launch badge in view mode ✅
- Add `AGENT_MULTILAUNCH_PROMPT` command ID ✅
- Add basic type definitions ✅

**Phase 2: Core Logic** ✅ COMPLETE

- Implement multi-launch orchestration (`executeMultiLaunch`) ✅
- Layout calculation algorithms (`calculateMultiLaunchLayout`) ✅
- Worktree creation coordination ✅
- Command execution via `sendKeypress` ✅
- Error handling and notifications ✅
- Helper function `getEnabledMultiLaunchAgents` ✅

**Phase 3: UI Components** ✅ COMPLETE

- Multi-launch prompt modal (`MultiLaunchPrompt.tsx`) ✅
- Agent selection interface ✅
- Layout description display ✅
- Progress feedback via notifications ✅
- Error handling UI ✅

**Phase 4: Command System Integration** ✅ COMPLETE

- Register multi-launch command in `applicationCommands.ts` ✅
- Bind Cmd+I keybinding ✅
- Add context requirements (terminal pane + git repo) ✅
- Wire up UI state (`showMultiLaunchPrompt`) ✅
- Integrate with app.tsx ✅
- Add `setShowMultiLaunchPrompt` to CommandContext ✅

**Phase 5: Testing & Refinement** 🔄 READY FOR TESTING

- Manual testing of multi-launch flow
- Test with 2, 3, 4, 5, 6+ agents
- Error scenario testing (no git repo, no enabled agents, etc.)
- Performance testing with many worktrees
- Layout validation
- Command execution verification

**Phase 6: Documentation & Release** 📝 PENDING

- User documentation
- Developer guide
- Demo materials
- Beta testing
