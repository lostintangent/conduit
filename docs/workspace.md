# Workspace Architecture

This document provides a comprehensive overview of how Conduit workspaces are structured, persisted, and converted between different formats.

## Table of Contents

- [Overview](#overview)
- [Data Flow](#data-flow)
- [Workspace Formats](#workspace-formats)
  - [Renderer State](#renderer-state)
  - [Workspace State](#workspace-state)
  - [Workspace Templates](#workspace-templates)
- [Type Relationships](#type-relationships)
- [Conversion Process](#conversion-process)
- [File Structure](#file-structure)

## Overview

Conduit workspaces represent the complete state of a user's tab layout, including terminal sessions, browser panes, and editor configurations. The workspace system supports:

1. **Auto-saving** - Automatically persists the last workspace on close for session restore
2. **Named workspaces** - User-saved workspace configurations for quick access
3. **Import/Export** - YAML-based workspace templates for sharing and version control

The workspace system uses three distinct representations optimized for different purposes:

| Format         | Purpose     | Storage              | Optimized For                     |
| -------------- | ----------- | -------------------- | --------------------------------- |
| Renderer State | Runtime UI  | Memory (Jotai atoms) | Fast access, reactive updates     |
| Workspace      | Persistence | JSON file            | Complete serialization            |
| Template       | Sharing     | YAML file            | Human readability, minimal syntax |

## Data Flow

```
                    ┌─────────────────┐
                    │  Renderer Tab[] │
                    └────────┬────────┘
                             │ serializeTabs (index.ts)
                             ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   Template   │◄──►│    Workspace    │◄──►│   JSON Storage   │
│    (YAML)    │    │   (shared type) │    │                  │
└──────────────┘    └─────────────────┘    └──────────────────┘
        ▲                                           ▲
        │ convertTemplateToWorkspace                │
        │ convertWorkspaceToTemplate                │
        │ (template/converter.ts)                   │
        │                                           │
   Import/Export                              Save/Load
   (user-facing)                            (auto-persist)
```

### Flow Descriptions

- **Renderer → Workspace**: When saving, the renderer's `Tab[]` is serialized to `Workspace` format, capturing terminal commands from live sessions
- **Workspace → JSON**: The serialized workspace is persisted to `workspaces.json` in the user data directory
- **Workspace ↔ Template**: Bidirectional conversion for import/export functionality

## Workspace Formats

### Renderer State

The renderer maintains workspace state in Jotai atoms for reactive UI updates. This format is optimized for fast pane lookups and real-time state management.

**Source:** `src/renderer/types.ts`

```typescript
type Tab = TabMetadata & {
  id: string;
  panes: Record<string, Pane>; // Keyed by pane ID for O(1) lookup
  layout: LayoutNode;
  activePaneId: string;
};

type Pane = TerminalPane | BrowserPane | EditorPane;
```

**Key characteristics:**

- Panes stored as `Record<string, Pane>` for fast access by ID
- Layout tree references panes by `paneId`
- Includes runtime-only fields like `sessionId` and `processTitle`
- Terminal panes track agent session metadata

**Example renderer terminal pane:**

```typescript
{
  id: "pane-abc123",
  type: "terminal",
  sessionId: "sess-xyz789",      // Runtime PTY session
  cwd: "/Users/dev/project",
  processTitle: "zsh",           // Current process name
  command: null,                 // Captured on save
  vmMetadata: { ... }            // Cloud VM info if applicable
}
```

### Workspace State

The workspace format is used for JSON persistence. It's a complete serialization of the workspace suitable for storage and restoration.

**Source:** `src/shared/types/workspace.ts`

```typescript
type Workspace = {
  name: string;
  lastModified: number;
  tabs: WorkspaceTab[];
  activeTabId: string;
};

type WorkspaceTab = TabMetadata & {
  id: string;
  panes: Pane[]; // Array format for JSON serialization
  activePaneId: string;
  layout: LayoutNode;
};
```

**Key characteristics:**

- Panes stored as `Pane[]` array (converted from Record on save)
- Includes `lastModified` timestamp for sorting
- Stored in `{userData}/workspaces.json`
- Terminal commands captured from live sessions during save

**Example workspace structure:**

```json
{
  "name": "My Project",
  "lastModified": 1701619200000,
  "activeTabId": "tab-1",
  "tabs": [
    {
      "id": "tab-1",
      "name": "Development",
      "panes": [
        {
          "id": "pane-1",
          "type": "terminal",
          "cwd": "/Users/dev/project",
          "command": "npm run dev"
        },
        {
          "id": "pane-2",
          "type": "editor",
          "cwd": "/Users/dev/project",
          "treeMode": "all"
        }
      ],
      "layout": {
        "type": "split",
        "direction": "row",
        "id": "layout-1",
        "children": [
          { "type": "pane", "paneId": "pane-1", "id": "layout-2" },
          { "type": "pane", "paneId": "pane-2", "id": "layout-3" }
        ]
      },
      "activePaneId": "pane-1"
    }
  ]
}
```

### Workspace Templates

Templates are the YAML format designed for human authoring and sharing. They use a minimal syntax with smart defaults and type inference.

**Source:** `src/ipc/workspace/template/types.ts`

```typescript
type WorkspaceTemplate = {
  name: string;
  cwd?: string; // Default CWD for all panes
  tabs: TemplateTab[];
};

type TemplateTab = TabMetadata & {
  cwd?: string; // Tab-level CWD override
  active?: boolean;
} & (TemplateSplit | TemplatePane);

type TemplatePane = Partial<TerminalPane & BrowserPane & EditorPane> & {
  type?: PaneType; // Inferred if not specified
  active?: boolean;
  collapsed?: boolean;
};

type TemplateSplit = {
  split?: SplitDirection; // Defaults to "row"
  panes: (TemplatePane | TemplateSplit)[];
};
```

**Key characteristics:**

- Layout embedded directly in tab structure (no separate layout tree)
- All pane fields optional - types inferred from properties
- CWD inheritance: workspace → tab → pane
- IDs only required for cross-pane references (`cloneOf`, `devToolsFor`)

**Example template (YAML):**

```yaml
name: My Project
cwd: /Users/dev/project
tabs:
  - name: Development
    active: true
    split: row
    panes:
      - command: npm run dev
      - type: editor
        treeMode: changes

  - name: Testing
    panes:
      - command: npm test -- --watch
```

**Type inference rules:**

| Property Present          | Inferred Type |
| ------------------------- | ------------- |
| `command` or `cloneOf`    | `terminal`    |
| `url` or `devToolsFor`    | `browser`     |
| `file` or (none of above) | `editor`      |

## Type Relationships

The shared type system provides common definitions used across all three formats:

| Type                                              | Location                  | Used By                  |
| ------------------------------------------------- | ------------------------- | ------------------------ |
| `PaneType`                                        | `@shared/types/panes`     | All formats              |
| `TerminalPane`, `BrowserPane`, `EditorPane`       | `@shared/types/panes`     | Workspace, Template base |
| `LayoutNode`, `LayoutPaneNode`, `LayoutSplitNode` | `@shared/types/layout`    | Workspace, Renderer      |
| `SplitDirection`                                  | `@shared/types/layout`    | All formats              |
| `TabMetadata`                                     | `@shared/types/panes`     | All formats              |
| `Workspace`, `WorkspaceTab`                       | `@shared/types/workspace` | Persistence              |

### Pane Type Extensions

The renderer extends shared pane types with runtime-specific fields:

```typescript
// Shared (serializable)
type TerminalPane = {
  id: string;
  type: "terminal";
  cwd?: string | null;
  command?: string | null;
  cloneOf?: string;
};

// Renderer (runtime)
type TerminalPane = SharedTerminalPane & {
  sessionId: string; // PTY session reference
  processTitle: string; // Current process name
  vmMetadata?: VMMetadata; // Cloud VM info
  // Agent session metadata...
};
```

## Conversion Process

### Template → Workspace (`convertTemplateToWorkspace`)

Converts a minimal YAML template into a fully-expanded workspace:

1. **Generate IDs** - Create unique IDs for all panes and layout nodes
2. **Infer types** - Determine pane types from properties
3. **Flatten layout** - Convert nested structure to separate panes array + layout tree
4. **Resolve references** - Map template IDs to generated IDs for `cloneOf`/`devToolsFor`
5. **Apply defaults** - Set default values (`treeMode: "all"`, etc.)

```typescript
const workspace = convertTemplateToWorkspace(template, "/path/to/yaml");
```

### Workspace → Template (`convertWorkspaceToTemplate`)

Converts a workspace to a minimal, human-readable template:

1. **Scan references** - Identify panes that need IDs (referenced by others)
2. **Hoist CWD** - Extract common CWD to tab level
3. **Omit inferable fields** - Remove `type` when it can be inferred
4. **Embed layout** - Convert layout tree back to nested structure
5. **Clean metadata** - Remove runtime-only fields

```typescript
const template = convertWorkspaceToTemplate(workspace);
const yaml = YAML.stringify(template);
```

### Renderer → Workspace (`serializeTabs`)

Converts renderer state to workspace format for persistence:

1. **Convert pane storage** - Transform `Record<string, Pane>` to `Pane[]`
2. **Capture commands** - Query live terminal sessions for current command
3. **Strip runtime fields** - Remove `sessionId`, `processTitle`, etc.

```typescript
const serializedTabs = await serializeTabs(tabs);
```

## File Structure

### Source Files

```
src/ipc/workspace/
├── index.ts              # IPC handlers, serialization
└── template/
    ├── index.ts          # Re-exports
    ├── types.ts          # Template type definitions
    └── converter.ts      # Bidirectional conversion

src/shared/types/
├── panes.ts              # PaneType, Pane types, TabMetadata
├── layout.ts             # LayoutNode, SplitDirection
└── workspace.ts          # Workspace, WorkspaceTab, WorkspaceState

src/renderer/types.ts     # Runtime pane types with extensions
```

### IPC Handlers

| Handler                         | Description                   |
| ------------------------------- | ----------------------------- |
| `workspace:get-state`           | Get current workspace state   |
| `workspace:save-workspace`      | Save named workspace          |
| `workspace:delete-workspace`    | Delete named workspace        |
| `workspace:rename-workspace`    | Rename existing workspace     |
| `workspace:save-last-workspace` | Auto-save for session restore |
| `workspace:import`              | Import from YAML file         |
| `workspace:export-to-file`      | Export to YAML file           |

### Storage Locations

| File              | Location      | Content                               |
| ----------------- | ------------- | ------------------------------------- |
| `workspaces.json` | `{userData}/` | All saved workspaces + last workspace |
| `*.yaml`          | User-chosen   | Exported workspace templates          |

## Template Examples

### Minimal Terminal Tab

```yaml
name: Simple
tabs:
  - command: npm start
```

### Split Layout with Editor

```yaml
name: Development
cwd: ~/project
tabs:
  - title: Code
    split: row
    panes:
      - type: editor
        treeMode: changes
      - split: column
        panes:
          - command: npm run dev
          - command: npm test -- --watch
```

### Browser with DevTools

```yaml
name: Web Dev
tabs:
  - split: row
    panes:
      - id: main-browser
        url: http://localhost:3000
      - devToolsFor: main-browser
```

### Cloned Terminals

```yaml
name: Multi-Server
cwd: ~/monorepo
tabs:
  - split: row
    panes:
      - id: api
        cwd: ./packages/api
        command: npm run dev
      - cloneOf: api
        cwd: ./packages/web
```
