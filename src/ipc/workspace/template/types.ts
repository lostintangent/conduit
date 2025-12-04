import type {
  BrowserPane,
  EditorPane,
  PaneType,
  TabMetadata,
  TerminalPane,
} from "@shared/types";

/**
 * Template pane definition for YAML workspace files.
 *
 * Combines all pane type properties with template-specific options.
 * All fields are optional to support type inference and minimal YAML authoring.
 *
 * Type inference: explicit `type` > url/devToolsFor (browser) > file/treeMode (editor) > terminal
 *
 * @see docs/workspace.md for full format documentation
 */
export type TemplatePane = Partial<
  Omit<TerminalPane, "type"> &
    Omit<BrowserPane, "type"> &
    Omit<EditorPane, "type">
> & {
  /** Explicit pane type. Usually inferred from other properties. */
  type?: PaneType;
  /** Mark this pane as the active pane in the tab. First pane is active by default. */
  active?: boolean;
  /** Start this pane in a collapsed state. */
  collapsed?: boolean;
};

/**
 * A node in the workspace layout tree.
 *
 * String shorthand: `http(s)://` → browser, `file://` → editor, other → terminal, `null` → empty terminal
 *
 * @see docs/workspace.md for full format documentation
 */
export type TemplateLayoutNode = TemplatePane | TemplateSplit | string | null;

/**
 * A split container in the layout tree.
 *
 * - `row:` - horizontal split (side-by-side)
 * - `column:` - vertical split (stacked)
 * - `panes:` - alias for `row:` (preferred at tab level)
 */
export type TemplateSplit = {
  /** Horizontal split - children arranged left to right */
  row?: TemplateLayoutNode[];
  /** Vertical split - children arranged top to bottom */
  column?: TemplateLayoutNode[];
  /** Alias for `row:`. Preferred at tab level for readability. */
  panes?: TemplateLayoutNode[];
};

/**
 * A tab definition in the workspace template.
 *
 * Contains a layout (via `row:`, `column:`, or `panes:`) or a single pane definition.
 */
export type TemplateTab = TabMetadata & {
  /** Working directory for all panes in this tab (inherited by panes) */
  cwd?: string;
  /** Mark this tab as the active tab. First tab is active by default. */
  active?: boolean;
} & (TemplateSplit | TemplatePane);

/**
 * The root workspace template structure for YAML import/export.
 *
 * @see docs/workspace.md for full format documentation
 */
export type WorkspaceTemplate = {
  /** Display name for the workspace */
  name: string;
  /** Default working directory for all tabs and panes */
  cwd?: string;
  /** Tab definitions */
  tabs: TemplateTab[];
};
