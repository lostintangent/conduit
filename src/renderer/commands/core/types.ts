import type { WhenClause } from '../whenClauses/WhenClause';
import type { KeybindingDescriptor } from '../keybindings/types';
import type { MenuContribution } from '../menus/types';

/**
 * Base context available to all commands
 */
export interface CommandContext {
  // Services will be defined in detail later
  // For now, use placeholder types
  readonly tabs: any;
  readonly panes: any;
  readonly terminals: any;
  readonly workspaces: any;
  readonly commands: any;
  readonly dialogs: any;
  readonly notifications: any;
  readonly settings: any;
  readonly contextKeys: any;
  readonly view: any;

  // State accessors
  readonly activeTab: any | null;
  readonly activePaneId: string | null;
  readonly workspaceName: string | undefined;
}

/**
 * Command descriptor with typed context
 */
export interface CommandDescriptor<TContext extends CommandContext = CommandContext> {
  /** Unique command identifier */
  id: string;

  /** Human-readable title */
  title: string;

  /** Category for Command Palette */
  category?: string;

  /** Icon identifier */
  icon?: string;

  /** When clause (command enabled when true) */
  when?: WhenClause;

  /** Keyboard shortcuts */
  keybinding?: KeybindingDescriptor | KeybindingDescriptor[];

  /** Menu contributions */
  menu?: MenuContribution | MenuContribution[];

  /** Command handler - can return a value or void */
  run: (context: TContext, ...args: unknown[]) => unknown | Promise<unknown>;
}

/**
 * Disposable resource
 */
export interface Disposable {
  dispose(): void;
}
