# Z-Index Stacking Rules

This document outlines the z-index layering system used throughout the application. The layers are organized to ensure proper visual stacking of UI elements.

## Layer Overview

The application uses a hierarchical z-index system with distinct layer groups. Each group serves a specific purpose and contains related UI elements.

```
z-[90]  ─────────────────────────────────  Notifications (topmost)
z-[85]  ─────────────────────────────────  Tab Preview
z-[80]  ─────────────────────────────────  Dialogs/Modals
z-[70]  ─────────────────────────────────  HyperTerminal (floating)
z-[65]  ─────────────────────────────────  Overview Mode Buttons
z-[60]  ─────────────────────────────────  Focus Mode Indicator
z-50    ─────────────────────────────────  UI Overlays (tooltips, menus)
z-40    ─────────────────────────────────  Sidebar
z-[35]  ─────────────────────────────────  Drag/Drop Overlays
z-[34]  ─────────────────────────────────  Design Mode Fan Buttons
z-[32]  ─────────────────────────────────  Design Mode Control Buttons
z-[30]  ─────────────────────────────────  Design Mode Tint Overlay
z-20    ─────────────────────────────────  Pane Controls (sync, resize)
z-10    ─────────────────────────────────  Pane Internals (badges, highlight)
z-[5]   ─────────────────────────────────  Inactive Pane Dimmer
z-0     ─────────────────────────────────  Base Content
```

## Layer Groups

### 1. Base Pane Content (z-0 to z-10)

**Purpose:** Elements within individual panes that don't need to overlay other UI.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-0` | Pane content | - | Default content layer |
| `z-[5]` | Inactive pane dimmer | `TabLayout.tsx` | Dims non-active panes when setting enabled |
| `z-10` | PaneHighlight | `PaneHighlight.tsx` | Active pane border animation |
| `z-10` | TerminalGitStats | `TerminalGitStats.tsx` | Git branch/status badge |
| `z-10` | SandboxIndicator | `SandboxIndicator.tsx` | VM/agent indicator |
| `z-10` | Resize handles | `EditorPane.tsx`, `TreeResizer.tsx` | Panel resize handles |

### 2. Pane Controls (z-20)

**Purpose:** Interactive controls within panes that need to appear above base content.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-20` | Sync indicator | `TerminalPane.tsx` | Keyboard sync status |
| `z-20` | Intersection handles | `IntersectionHandles.tsx` | Multi-axis resize handles |

### 3. Pane Overlays (z-30)

**Purpose:** Search widgets, cloud overlays, and terminal dimensions that overlay pane content.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-30` | SearchWidget | `SearchWidget.tsx` | Terminal search UI |
| `z-30` | CloudTerminalOverlay | `CloudTerminalOverlay.tsx` | SSH connection state |
| `z-30` | Terminal dimensions | `TerminalPane.tsx` | Resize dimensions display |

### 4. Design Mode Layer (z-[30] to z-[35])

**Purpose:** UI elements that appear when the application is in design mode. These must appear above all pane controls but below the sidebar.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-[30]` | Design mode tint | `TabLayout.tsx` | Accent overlay on panes |
| `z-[30]` | Preview hover overlay | `TabLayout.tsx` | Blue highlight on preview hover |
| `z-[32]` | PaneControlButtons | `PaneControlButtons.tsx` | Split/move/close buttons |
| `z-[34]` | PaneControlFanButtons | `PaneControlFanButtons.tsx` | Expanded split options |
| `z-[35]` | Drop zone overlay | `usePaneDragDrop.tsx` | Pane drag indicators |
| `z-[35]` | Image drop overlay | `TerminalPane.tsx`, `CanvasPane.tsx` | Image drag/drop indicator |
| `z-[35]` | Tab edge drop zone | `TabLayout.tsx` | Root-level split indicators |

### 5. Sidebar (z-40)

**Purpose:** The resizable sidebar panel that overlays the main content area.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-40` | ResizablePanel | `ResizablePanel.tsx` | Sidebar container |

### 6. UI Overlays (z-50)

**Purpose:** Standard UI overlay components like tooltips, popovers, and dropdown menus.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-50` | Tooltip | `tooltip.tsx` | Hover tooltips |
| `z-50` | Popover | `popover.tsx` | Click popovers |
| `z-50` | DropdownMenu | `dropdown-menu.tsx` | Context menus |
| `z-50` | Drawer | `drawer.tsx` | Mobile drawer |
| `z-50` | RepoScriptsMenu | `TerminalPane.tsx` | Repository scripts dropdown |
| `z-50` | AgentPanel | `AgentPanel.tsx` | Terminal agent panel |

### 7. Application Mode Indicators (z-[60] to z-[65])

**Purpose:** Mode-specific UI elements that need to float above regular content.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-[60]` | FocusModeIndicator | `FocusModeIndicator.tsx` | Focus mode status |
| `z-[65]` | TabsOverview buttons | `TabsOverview.tsx` | Overview mode floating buttons |

### 8. Floating Windows (z-[70])

**Purpose:** Floating terminal windows that can be positioned anywhere on screen.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-[70]` | HyperTerminal | `HyperTerminal.tsx` | Floating quick terminal |

### 9. Modals (z-[80])

**Purpose:** Modal dialogs that require user attention and block interaction with content below.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-[80]` | Dialog overlay | `dialog.tsx` | Modal backdrop |
| `z-[80]` | Dialog content | `dialog.tsx` | Modal content |

### 10. Previews (z-[85])

**Purpose:** Preview overlays that appear when hovering over tabs.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-[85]` | TabPreviewOverlay | `TabPreviewOverlay.tsx` | Tab hover preview |

### 11. Notifications (z-[90])

**Purpose:** Toast notifications that should always be visible above all other content.

| z-index | Component | File | Description |
|---------|-----------|------|-------------|
| `z-[90]` | NotificationCenter | `NotificationCenter.tsx` | Toast notifications |

## Guidelines

### Adding New Components

1. **Identify the layer group** your component belongs to
2. **Use the established z-index** for that group
3. **Document any new z-index values** in this file
4. **Avoid arbitrary values** - use the defined layer groups

### When to Use Custom Values

Use `z-[n]` syntax when:
- You need a value between standard Tailwind values (10, 20, 30, 40, 50)
- The component needs precise positioning within a layer group
- Standard values would conflict with existing components

### Stacking Context

Remember that z-index only works within the same stacking context. A parent with `position: relative` and a z-index creates a new stacking context for its children.

### Testing

When modifying z-index values:
1. Test in **normal mode** - ensure pane controls are visible
2. Test in **design mode** - ensure design UI appears above pane controls
3. Test with **sidebar open** - ensure sidebar covers design mode UI
4. Test **dialogs** - ensure they appear above everything except notifications
5. Test **notifications** - ensure they appear above dialogs
