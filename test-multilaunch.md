# Multi-Launch Mode Testing Guide

## Quick Test Procedure

### 1. Start the Application

```bash
npm start
```

### 2. Configure Test Agents

1. Open Command Palette: **Cmd+Shift+P**
2. Type "Configure Agents" and select
3. Add or edit an agent:
   - **ID:** `test-agent-1`
   - **Name:** `Test Agent 1`
   - **Command:** `echo "Agent 1: {arg}"`
   - **Launch Command:** `echo "Launching Agent 1: {arg}"`
   - **☑ Enable for Multi-Launch**
4. Add second agent:
   - **ID:** `test-agent-2`
   - **Name:** `Test Agent 2`
   - **Command:** `echo "Agent 2: {arg}"`
   - **Launch Command:** `echo "Launching Agent 2: {arg}"`
   - **☑ Enable for Multi-Launch**
5. Save

### 3. Test Multi-Launch

1. Open a terminal in a git repository
2. Press **Cmd+I**
3. You should see:
   - Purple-themed modal
   - "Multi-Launch Prompt" title
   - List showing:
     - ✓ Test Agent 1
     - ✓ Test Agent 2
   - Layout description: "Side-by-side split"
4. Type: `test task`
5. Press **Enter**

### 4. Expected Results

- ✅ Modal closes
- ✅ Notification: "Creating 2 agent sessions..."
- ✅ Two new terminal panes appear side-by-side
- ✅ Each pane is in a different git worktree
- ✅ Commands execute in terminals:
  - Left pane: `echo "Launching Agent 1: test task"`
  - Right pane: `echo "Launching Agent 2: test task"`
- ✅ Success notification: "Launched 2 agents"

### 5. Verify Worktrees

```bash
# Check worktrees were created
ls ~/.conduit/worktrees/$(basename $(git rev-parse --show-toplevel))
```

Should show 2 timestamped directories.

### 6. Test 4-Agent Grid

1. Add two more agents (test-agent-3, test-agent-4)
2. Enable them for multi-launch
3. Press Cmd+I
4. Enter prompt
5. Verify 2×2 grid layout appears

## Manual Test Cases

### TC1: Basic 2-Agent Launch

- **Setup:** 2 agents enabled
- **Action:** Cmd+I → Enter prompt → Launch
- **Expected:** Side-by-side panes, both agents execute

### TC2: No Git Repo

- **Setup:** Terminal in non-git directory
- **Action:** Press Cmd+I
- **Expected:** Command disabled (greyed out in palette)

### TC3: No Enabled Agents

- **Setup:** Disable all agents for multi-launch
- **Action:** Cmd+I → Enter prompt
- **Expected:** Error: "No agents enabled for multi-launch"

### TC4: Escape to Cancel

- **Setup:** 2 agents enabled
- **Action:** Cmd+I → Press Escape
- **Expected:** Modal closes, no agents launched

### TC5: Empty Prompt

- **Setup:** 2 agents enabled
- **Action:** Cmd+I → Press Enter without typing
- **Expected:** Launch button disabled (can't submit)

### TC6: Special Characters

- **Setup:** 2 agents enabled
- **Action:** Enter prompt with quotes: `implement "auth" system`
- **Expected:** Quotes properly escaped in commands

### TC7: Layout Descriptions

Test each agent count and verify layout descriptions:

- 2 agents → "Side-by-side split"
- 3 agents → "T-shape layout (1 top, 2 bottom)"
- 4 agents → "2×2 grid"
- 5 agents → "2 top, 3 bottom"
- 6 agents → "3×2 grid"

## Visual Verification

### Multi-Launch Prompt Modal

- [ ] Purple border and accent colors
- [ ] Rocket icon in header
- [ ] Clear title: "Multi-Launch Prompt"
- [ ] Subtitle shows agent count
- [ ] Input field has placeholder text
- [ ] Agent list shows all enabled agents
- [ ] Launch commands visible in agent list
- [ ] Layout description shown
- [ ] Launch button with rocket icon
- [ ] Cancel button works
- [ ] X button closes modal
- [ ] Escape key closes modal

### Agent Editor

- [ ] "Launch Command" input field visible
- [ ] "Enable for Multi-Launch" checkbox visible
- [ ] Help text explains {arg} placeholder
- [ ] Purple "multi-launch" badge in view mode
- [ ] Launch command displayed in view mode

### Notifications

- [ ] Progress: "Creating N agent sessions..."
- [ ] Success: "Launched N agents"
- [ ] Error messages are clear and helpful

## Performance Testing

### Stress Test: 8 Agents

1. Configure 8 agents
2. Enable all for multi-launch
3. Launch with Cmd+I
4. Verify:
   - All 8 worktrees created
   - All 8 panes arranged in grid
   - All 8 commands execute
   - No crashes or hangs
   - Reasonable completion time (< 30 seconds)

## Cleanup

After testing, remove test worktrees:

```bash
# List worktrees
git worktree list

# Remove each test worktree
git worktree remove ~/.conduit/worktrees/conduit/TIMESTAMP-ID
```

Or use the built-in cleanup:

1. Cmd+Shift+P → "Manage Agent Sessions"
2. Select and delete test sessions

## Known Limitations

1. Requires git repository
2. Maximum practical agents: ~8 (UI gets crowded)
3. No undo for multi-launch
4. Can't customize prompt per agent (all get same prompt)
5. No way to pause/cancel mid-launch

## Debugging

### Enable Console Logs

```typescript
// In multiLaunch.ts, add debug logging
console.log("Multi-launch executing", { agents, prompt });
console.log("Created session", session);
console.log("Created pane", newPaneId);
```

### Check Worktree Status

```bash
# See all active worktrees
git worktree list

# Check specific worktree
cd ~/.conduit/worktrees/conduit/TIMESTAMP-ID
git status
```

### Verify Agent Commands

```bash
# Test agent command manually
echo "Test: test prompt"

# Verify agent is in PATH
which codex
which claude
```

## Success Criteria

✅ All test cases pass
✅ No TypeScript errors
✅ No runtime errors
✅ Layouts render correctly
✅ Commands execute successfully
✅ Worktrees created properly
✅ Notifications appear
✅ UI is responsive and attractive
✅ Keyboard shortcuts work
✅ Error handling is graceful

## Next Steps After Testing

1. Fix any bugs found
2. Optimize performance if needed
3. Add user documentation
4. Create demo video
5. Announce to beta testers
