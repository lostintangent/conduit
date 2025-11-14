# Git Diff Viewer for File Browser - Design Specification

## Overview

When the file browser is in "filter mode" (showing only git-changed files), selecting a file should display its diff in the editor pane rather than the raw file content. This provides a seamless workflow for reviewing, reverting, or committing changes without switching to command-line git tools.

## Current Implementation Context

### File Browser Filter Mode

- **Location**: `src/renderer/components/panes/editor/EditorPane.tsx`
- **Trigger**: Filter button in tree toolbar (lines 1223-1240)
- **State**: `showOnlyChangedFiles` boolean (line 222)
- **Behavior**: When enabled, `filterTreeByGitStatus()` (lines 888-934) filters the file tree to show only files with git status changes
- **Git Integration**: Uses `useGitStatus` hook to get git status from `@parcel/watcher` file watcher service

### File Selection Flow

- **Handler**: `handleFileSelect()` (lines 822-842)
- **Current Behavior**: Reads raw file content via `api.readFile()` and displays in Monaco editor
- **Props**: `onFileChange` callback updates parent state with file path, language, and content

### Git Status System

- **Status Source**: `src/ipc/git/gitStatus.ts` - provides status relative to HEAD or a base branch
- **Status Types**: modified, added, deleted, renamed, copied, untracked
- **Available Data**: Each file has `status`, `staged` flag, and `relativePath`
- **Base Branch**: User can select a branch to compare against (default: HEAD/uncommitted changes)

## Proposed Feature

### User Experience Goals

Design something that:

- **Feels great**: Smooth transitions, clear visual hierarchy, intuitive controls
- **Is highly usable**: Easy to understand at a glance, minimal cognitive load
- **Does the job well**: Shows diffs clearly, makes common actions (revert, stage) accessible
- **Stays simple**: Avoid overcomplicating the UI with too many options or modes

### Behavior

When a user:

1. Enables git filter mode (clicks Filter button when git changes exist)
2. Selects a file from the filtered tree

Then the editor should:

- Display a **diff view** instead of raw file content
- Show the changes visually with additions/deletions highlighted
- Provide quick actions for common git operations

### Diff Display Requirements

The diff view should show:

- **File header**: File path, git status (modified/added/deleted/renamed)
- **Diff content**: Side-by-side or unified diff view
- **Line numbers**: Both old and new line numbers for context
- **Syntax highlighting**: Maintain language-specific highlighting in diff context
- **Change indicators**: Clear visual distinction between additions (+), deletions (-), and context lines

### Quick Actions

Provide accessible buttons/controls for:

- **View raw file**: Toggle to see the current file content (not diff)
- **Revert changes**: Discard changes to this file (with confirmation)
- **Stage/Unstage**: Add or remove file from git staging area
- **Copy file path**: For use in terminal commands
- **Open in external diff tool**: (Optional enhancement)

### Technical Approach Suggestions

#### Option 1: Monaco Editor Diff Editor

Monaco editor provides a built-in diff editor component:

- Import: `@monaco-editor/react` already available in project (package.json line 60)
- Component: Use `DiffEditor` instead of `Editor` component
- API: Requires `original` and `modified` content strings
- Rendering: Built-in side-by-side and inline diff views with syntax highlighting

#### Option 2: Custom Diff Rendering

Build custom diff visualization:

- Parse diff using a library or custom parser
- Render in regular Monaco editor with decorations for additions/deletions
- More control over UX but more implementation work

**Recommendation**: Start with Option 1 (Monaco DiffEditor) for simplicity and maintainability.

## Implementation Guidance

### Files to Modify

1. **`src/renderer/components/panes/editor/EditorPane.tsx`**
   - Add state to track "diff mode" vs "raw mode"
   - Modify `handleFileSelect()` to detect filter mode and fetch diff data
   - Conditionally render DiffEditor vs regular Editor component
   - Add toolbar buttons for diff-specific actions

2. **`src/preload.ts`** (if needed)
   - Add IPC method to fetch file diff: `getFileDiff(filePath, baseBranch?)`
   - Should return original and modified content for Monaco DiffEditor

3. **`src/ipc/git/`** (new file or extend `gitStatus.ts`)
   - Implement diff generation logic
   - Use `git show` or `git diff` commands to get file changes
   - Handle different status types (added files have no "original", deleted files have no "modified")

### Key Implementation Considerations

1. **Mode Detection**: Only show diff view when BOTH conditions are true:
   - File browser is in filter mode (`showOnlyChangedFiles === true`)
   - Selected file has git status (exists in `gitStatus` map)

2. **Handle Edge Cases**:
   - **New files**: No "original" content - show empty left side or special "New file" indicator
   - **Deleted files**: No "modified" content - show empty right side
   - **Binary files**: Don't show diff, display message like "Binary file changed"
   - **Very large diffs**: Consider performance, maybe paginate or show partial diff

3. **Preserve Existing Behavior**:
   - When filter mode is OFF, always show raw file content
   - When user clicks "View raw file" button, switch to regular editor temporarily
   - Maintain file watcher integration for live updates

4. **UI Polish**:
   - Add visual indicator in file tree header showing diff mode is active
   - Show git status badge next to file name in editor header (M/A/D etc.)
   - Smooth transition between diff and raw views
   - Maintain unsaved changes detection (though in diff mode, files aren't editable)

5. **Accessibility**:
   - Make diff view read-only (no editing in diff mode)
   - Provide keyboard shortcuts for common actions (stage, revert)
   - Ensure toolbar buttons have clear labels and tooltips

### Testing Considerations

Test with:

- Files with various git statuses (modified, added, deleted, renamed)
- Large files and large diffs
- Binary files
- Files with merge conflicts
- Switching between filter mode on/off
- Switching between different base branches
- Multiple file selections in sequence

## Success Criteria

The feature is successful when:

1. Users can quickly review their git changes without leaving Conduit
2. The diff view is clear, readable, and performs well
3. Common actions (revert, stage) are easy to access and execute
4. The UI feels polished and integrated, not tacked-on
5. Edge cases are handled gracefully with appropriate messaging

## Future Enhancements (Out of Scope)

Consider for later iterations:

- Inline editing in diff view with staging hunks (like VS Code)
- Commit dialog from diff view
- History view showing previous commits for the file
- Compare any two commits/branches for a file
- Integration with git blame
