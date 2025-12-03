import type {
  BrowserPane,
  EditorPane,
  PaneType,
  SplitDirection,
  TabMetadata,
  TerminalPane,
} from "@shared/types";

/**
 * Template pane combines all pane properties with template-specific options.
 * All fields are optional to support type inference and minimal YAML authoring.
 * The actual pane type is inferred at conversion time based on which properties are set.
 */
export type TemplatePane = Partial<
  Omit<TerminalPane, "type"> &
    Omit<BrowserPane, "type"> &
    Omit<EditorPane, "type">
> & {
  type?: PaneType;
  active?: boolean;
  collapsed?: boolean;
};

export type TemplateSplit = {
  split?: SplitDirection; // Defaults to row
  panes: (TemplatePane | TemplateSplit)[];
};

export type TemplateLayoutNode = TemplatePane | TemplateSplit;

export type TemplateTab = TabMetadata & {
  cwd?: string;
  active?: boolean;
} & (TemplateSplit | TemplatePane);

export type WorkspaceTemplate = {
  name: string;
  cwd?: string;
  tabs: TemplateTab[];
};
