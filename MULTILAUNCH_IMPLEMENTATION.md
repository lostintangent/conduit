# Multi-Launch Mode Implementation Summary

## ✅ Implementation Complete

Multi-launch mode has been fully implemented and is ready for testing. This feature allows users to spawn multiple AI coding agents simultaneously, each in their own isolated git worktree.

## Files Created

### 1. **multilaunch.md** (Specification)

Complete specification document covering:

- Current system capabilities analysis
- Feature requirements and UX design
- Technical implementation details
- Future enhancements roadmap
- Open questions and decisions

### 2. **src/renderer/utils/multiLaunchLayout.ts**

Layout calculation utilities:

- `calculateMultiLaunchLayout(agentCount)` - Calculates optimal pane arrangement
- `getLayoutDescription(agentCount)` - Human-readable layout descriptions
- Supports 2-8+ agents with smart grid layouts
- Examples:
  - 2 agents: Side-by-side split
  - 3 agents: T-shape (1 top, 2 bottom)
  - 4 agents: 2×2 grid
  - 6 agents: 3×2 grid
  - 7+ agents: Dynamic grid calculation

### 3. **src/renderer/store/actions/multiLaunch.ts**

Core orchestration logic:

- `executeMultiLaunch()` - Main function that creates sessions and panes
- `getEnabledMultiLaunchAgents()` - Filters agents enabled for multi-launch
- Creates git worktrees for each agent
- Splits panes according to layout strategy
- Executes launch commands in each terminal
- Comprehensive error handling and notifications

### 4. **src/renderer/components/shell/MultiLaunchPrompt.tsx**

Beautiful modal UI component:

- Displays enabled agents
- Shows layout preview
- Accepts user prompt
- Enter to launch, Escape to cancel
- Visual feedback with purple accent theme
- Lists all agents that will be launched
- Shows launch commands for transparency

## Files Modified

### 1. **src/shared/types.ts**

Extended `AgentConfig` type:

```typescript
type AgentConfig = {
  id: string;
  name: string;
  command: string;
  launchCommand?: string; // NEW
  enabledForMultiLaunch?: boolean; // NEW
  isDefault?: boolean;
};
```

### 2. **src/shared/commands.ts**

Added command ID:

```typescript
AGENT_MULTILAUNCH_PROMPT: "agent.multilaunchPrompt";
```

### 3. **src/renderer/components/shell/agents/AgentsEditor.tsx**

Enhanced agent configuration UI:

- Added "Launch Command" text input field
- Added "Enable for Multi-Launch" checkbox
- Display purple "multi-launch" badge in view mode
- Shows launch command in view mode
- Default new agents to `enabledForMultiLaunch: false`

### 4. **src/renderer/commands/applicationCommands.ts**

Registered new command:

- ID: `AGENT_MULTILAUNCH_PROMPT`
- Title: "Multi-Launch Agents"
- Keybinding: **Cmd+I**
- Context: Terminal pane + Git repository required
- Action: Opens multi-launch prompt modal

### 5. **src/renderer/commands/core/types.ts**

Extended `CommandContext` interface:

```typescript
readonly setShowMultiLaunchPrompt?: (show: boolean) => void;
```

### 6. **src/renderer/app.tsx**

Integrated multi-launch UI:

- Added `showMultiLaunchPrompt` state
- Imported `MultiLaunchPrompt` component
- Wired up modal display and execution
- Passed agents from user settings
- Connected to command system

## Feature Highlights

### 🚀 User Experience

**Activation:**

- Press **Cmd+I** when focused on a terminal pane (requires git repo)
- Beautiful modal appears showing enabled agents

**Workflow:**

1. User types a task description
2. Sees which agents will be launched
3. Sees layout preview (e.g., "3×2 grid")
4. Presses Enter to launch
5. System creates isolated worktrees
6. Agents auto-launch with the prompt
7. Panes arranged in optimal layout

**Smart Layout:**

- 2 agents → Side-by-side
- 3 agents → T-shape
- 4 agents → 2×2 grid
- 5+ agents → Optimal grid arrangement

### 🔧 Technical Features

**Agent Sessions:**

- Each agent gets isolated git worktree
- Worktrees created in `~/.conduit/worktrees/<repo>/<timestamp-id>/`
- Independent branches for parallel development
- Full session lifecycle management

**Command Execution:**

- Prompt placeholder `{arg}` replaced with user input
- Automatic quote escaping
- Commands sent via `sendKeypress` API
- Immediate execution upon pane creation

**Error Handling:**

- No git repo → Clear error message
- No enabled agents → Helpful notification
- Session creation failures → Partial success handling
- Detailed error reporting per agent

**Notifications:**

- "Creating N agent sessions..." progress indicator
- "Launched N agents" success message
- Error details for failed launches
- Auto-dismiss for successes, persistent for errors

## Configuration Example

Here's how users configure agents for multi-launch:

```javascript
// In Agent Settings (via Cmd+Shift+P → "Configure Agents")
{
  id: "codex",
  name: "Codex",
  command: "codex -p {arg}",           // For Cmd+P prompt mode
  launchCommand: "codex {arg}",        // For Cmd+I multi-launch
  enabledForMultiLaunch: true,         // ✅ Include in multi-launch
  isDefault: false
}

{
  id: "claude",
  name: "Claude Sonnet",
  command: "claude --prompt {arg}",
  launchCommand: "claude {arg}",
  enabledForMultiLaunch: true,         // ✅ Include in multi-launch
  isDefault: true
}

{
  id: "copilot",
  name: "GitHub Copilot",
  command: "gh copilot suggest '{arg}'",
  launchCommand: undefined,
  enabledForMultiLaunch: false,        // ❌ Exclude from multi-launch
  isDefault: false
}
```

## Testing Checklist

### Basic Functionality

- [ ] Cmd+I opens multi-launch prompt on terminal pane
- [ ] Prompt shows all enabled agents
- [ ] Enter launches all agents
- [ ] Escape cancels without launching
- [ ] Each agent gets its own worktree
- [ ] Launch commands execute in terminals
- [ ] Panes arranged according to layout strategy

### Layout Testing

- [ ] 2 agents: Side-by-side layout
- [ ] 3 agents: T-shape layout
- [ ] 4 agents: 2×2 grid
- [ ] 5 agents: 2+3 layout
- [ ] 6 agents: 3×2 grid
- [ ] 7+ agents: Dynamic grid

### Error Scenarios

- [ ] No git repository → Error message
- [ ] No enabled agents → Warning notification
- [ ] Worktree creation fails → Partial success handling
- [ ] Invalid launch command → Error per agent
- [ ] Not on terminal pane → Command disabled

### Edge Cases

- [ ] All agents disabled → Helpful message
- [ ] One agent enabled → Creates single pane
- [ ] Mixed success/failure → Shows both counts
- [ ] Special characters in prompt → Proper escaping
- [ ] Very long prompts → Handled correctly

### Integration

- [ ] Works with existing agent sessions
- [ ] Compatible with focus mode
- [ ] Compatible with design mode
- [ ] Tab switching works correctly
- [ ] Pane closing works correctly

## Usage Instructions

### For End Users

1. **Configure Agents** (one-time setup):
   - Press Cmd+Shift+P → "Configure Agents"
   - For each agent:
     - Set "Launch Command" (e.g., `codex {arg}`)
     - Check "Enable for Multi-Launch"
   - Save changes

2. **Use Multi-Launch**:
   - Open terminal in a git repository
   - Press **Cmd+I**
   - Type your task (e.g., "Implement user authentication")
   - Press Enter
   - Watch agents launch in parallel!

3. **Manage Sessions**:
   - Each agent pane has its own worktree
   - Use "Merge and Close" to merge changes
   - Use "Terminate" to discard without merging

### For Developers

**Import multi-launch utilities:**

```typescript
import {
  executeMultiLaunch,
  getEnabledMultiLaunchAgents,
} from "@/store/actions/multiLaunch";
import {
  calculateMultiLaunchLayout,
  getLayoutDescription,
} from "@/utils/multiLaunchLayout";
```

**Execute multi-launch programmatically:**

```typescript
const enabledAgents = getEnabledMultiLaunchAgents(settings.agents);
await executeMultiLaunch(tabId, paneId, "your prompt", enabledAgents);
```

**Calculate layout:**

```typescript
const layout = calculateMultiLaunchLayout(4); // For 4 agents
const description = getLayoutDescription(4); // "2×2 grid"
```

## Architecture Notes

### Pane Creation Flow

1. Calculate layout steps (N-1 splits for N agents)
2. Create agent sessions (git worktrees)
3. Split panes iteratively using calculated layout
4. Execute launch commands in each terminal
5. Track success/failure per agent

### Layout Algorithm

- Uses recursive splitting strategy
- Each split creates one boundary between panes
- Optimized for common cases (2-6 agents)
- Falls back to grid calculation for 7+ agents
- Aims for balanced, aesthetic layouts

### Command Replacement

- Template: `codex {arg}`
- User prompt: `implement auth`
- Result: `codex "implement auth"`
- Handles quote escaping: `"` → `\"`

## Future Enhancements

See `multilaunch.md` for detailed roadmap. Highlights:

**Phase 2 - Advanced Features:**

- Agent-specific instructions per launch
- Different prompts per agent
- Multi-launch templates/presets
- Result comparison views

**Phase 3 - Collaboration:**

- Shared multi-launch sessions
- Team templates
- Result sharing

**Phase 4 - Orchestration:**

- Sequential execution mode
- Agent dependencies
- Conditional launches
- Consensus mechanisms

## Troubleshooting

**Q: Cmd+I doesn't work**

- Ensure you're focused on a terminal pane
- Check you're in a git repository
- Verify at least one agent has `enabledForMultiLaunch: true`

**Q: No agents appear in prompt**

- Open Agent Settings (Cmd+Shift+P → "Configure Agents")
- Check "Enable for Multi-Launch" checkbox
- Ensure "Launch Command" is filled in

**Q: Agents don't execute**

- Verify launch command is correct
- Check terminal for error messages
- Ensure agent CLI is installed and in PATH

**Q: Layout looks weird**

- This is expected for unusual agent counts
- Try 2, 3, 4, or 6 agents for best layouts
- Future updates will improve layout algorithm

## Credits

Implemented by: GitHub Copilot CLI
Specification: multilaunch.md
Date: 2025-11-21

## License

Same as parent Conduit project (not yet open source)
