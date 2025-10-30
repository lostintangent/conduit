import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerApplicationCommands, ApplicationCommands } from '@/commands/applicationCommands';
import type { ICommandRegistry } from '@/commands/core/CommandRegistry';
import type { CommandDescriptor, CommandContext } from '@/commands/core/types';

describe('applicationCommands', () => {
  let mockRegistry: ICommandRegistry;
  let registeredCommands: Map<string, CommandDescriptor>;

  beforeEach(() => {
    registeredCommands = new Map();

    mockRegistry = {
      registerCommand: vi.fn((descriptor: CommandDescriptor) => {
        registeredCommands.set(descriptor.id, descriptor);
        return { dispose: vi.fn() };
      }),
      executeCommand: vi.fn(),
      getCommand: vi.fn((id: string) => registeredCommands.get(id)),
      getAllCommands: vi.fn(() => Array.from(registeredCommands.values())),
      hasCommand: vi.fn((id: string) => registeredCommands.has(id)),
      setContextBuilder: vi.fn(),
    };
  });

  describe('registerApplicationCommands', () => {
    it('should register all view commands', () => {
      registerApplicationCommands(mockRegistry);

      expect(mockRegistry.registerCommand).toHaveBeenCalledTimes(3);
      expect(registeredCommands.has(ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE)).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE)).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS)).toBe(true);
    });
  });

  describe('view.toggleFocusMode', () => {
    let command: CommandDescriptor;

    beforeEach(() => {
      registerApplicationCommands(mockRegistry);
      command = registeredCommands.get(ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE)!;
    });

    it('should have correct metadata', () => {
      expect(command.id).toBe(ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE);
      expect(command.title).toBe('Toggle Focus Mode');
      expect(command.category).toBe('View');
    });

    it('should have simplified keybinding', () => {
      expect(command.keybinding).toBeDefined();
      expect(command.keybinding).toHaveProperty('key', 'Cmd+Alt+F');

      // Should not have platform-specific overrides
      const binding = command.keybinding as any;
      expect(binding.mac).toBeUndefined();
      expect(binding.win).toBeUndefined();
      expect(binding.linux).toBeUndefined();
    });

    it('should call context.view.toggleFocusMode when activeTab exists', () => {
      const mockToggleFocusMode = vi.fn();
      const mockContext: CommandContext = {
        view: {
          toggleFocusMode: mockToggleFocusMode,
          togglePaneControls: vi.fn(),
        },
        activeTab: {
          id: 'tab-123',
          activePaneId: 'pane-456',
        },
        activePaneId: 'pane-456',
        workspaceName: undefined,
        tabs: null,
        panes: null,
        terminals: null,
        workspaces: null,
        commands: null,
        dialogs: null,
        notifications: null,
        settings: null,
        contextKeys: null,
      };

      command.run(mockContext);

      expect(mockToggleFocusMode).toHaveBeenCalledTimes(1);
      expect(mockToggleFocusMode).toHaveBeenCalledWith('tab-123', 'pane-456');
    });

    it('should not call toggleFocusMode when activeTab is null', () => {
      const mockToggleFocusMode = vi.fn();
      const mockContext: CommandContext = {
        view: {
          toggleFocusMode: mockToggleFocusMode,
          togglePaneControls: vi.fn(),
        },
        activeTab: null,
        activePaneId: null,
        workspaceName: undefined,
        tabs: null,
        panes: null,
        terminals: null,
        workspaces: null,
        commands: null,
        dialogs: null,
        notifications: null,
        settings: null,
        contextKeys: null,
      };

      command.run(mockContext);

      expect(mockToggleFocusMode).not.toHaveBeenCalled();
    });

    it('should handle context with activeTab but no view service gracefully', () => {
      const mockContext: CommandContext = {
        view: null as any,
        activeTab: {
          id: 'tab-123',
          activePaneId: 'pane-456',
        },
        activePaneId: 'pane-456',
        workspaceName: undefined,
        tabs: null,
        panes: null,
        terminals: null,
        workspaces: null,
        commands: null,
        dialogs: null,
        notifications: null,
        settings: null,
        contextKeys: null,
      };

      // Should throw when trying to call toggleFocusMode on null
      expect(() => command.run(mockContext)).toThrow();
    });
  });

  describe('view.toggleDesignMode', () => {
    let command: CommandDescriptor;

    beforeEach(() => {
      registerApplicationCommands(mockRegistry);
      command = registeredCommands.get(ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE)!;
    });

    it('should have correct metadata', () => {
      expect(command.id).toBe(ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE);
      expect(command.title).toBe('Toggle Design Mode');
      expect(command.category).toBe('View');
    });

    it('should have simplified keybinding', () => {
      expect(command.keybinding).toBeDefined();
      expect(command.keybinding).toHaveProperty('key', 'Cmd+D');

      // Should not have platform-specific overrides
      const binding = command.keybinding as any;
      expect(binding.mac).toBeUndefined();
      expect(binding.win).toBeUndefined();
      expect(binding.linux).toBeUndefined();
    });

    it('should call context.view.toggleDesignMode', () => {
      const mockToggleDesignMode = vi.fn();
      const mockContext: CommandContext = {
        view: {
          toggleFocusMode: vi.fn(),
          toggleDesignMode: mockToggleDesignMode,
        },
        activeTab: null,
        activePaneId: null,
        workspaceName: undefined,
        tabs: null,
        panes: null,
        terminals: null,
        workspaces: null,
        commands: null,
        dialogs: null,
        notifications: null,
        settings: null,
        contextKeys: null,
      };

      command.run(mockContext);

      expect(mockToggleDesignMode).toHaveBeenCalledTimes(1);
      expect(mockToggleDesignMode).toHaveBeenCalledWith();
    });

    it('should work regardless of activeTab state', () => {
      const mockToggleDesignMode = vi.fn();

      // Test with activeTab present
      const mockContextWithTab: CommandContext = {
        view: {
          toggleFocusMode: vi.fn(),
          toggleDesignMode: mockToggleDesignMode,
        },
        activeTab: { id: 'tab-123', activePaneId: 'pane-456' },
        activePaneId: 'pane-456',
        workspaceName: undefined,
        tabs: null,
        panes: null,
        terminals: null,
        workspaces: null,
        commands: null,
        dialogs: null,
        notifications: null,
        settings: null,
        contextKeys: null,
      };

      command.run(mockContextWithTab);
      expect(mockToggleDesignMode).toHaveBeenCalledTimes(1);

      mockToggleDesignMode.mockClear();

      // Test with activeTab null
      const mockContextWithoutTab: CommandContext = {
        view: {
          toggleFocusMode: vi.fn(),
          toggleDesignMode: mockToggleDesignMode,
        },
        activeTab: null,
        activePaneId: null,
        workspaceName: undefined,
        tabs: null,
        panes: null,
        terminals: null,
        workspaces: null,
        commands: null,
        dialogs: null,
        notifications: null,
        settings: null,
        contextKeys: null,
      };

      command.run(mockContextWithoutTab);
      expect(mockToggleDesignMode).toHaveBeenCalledTimes(1);
    });
  });

  describe('view.openKeyboardShortcuts', () => {
    let command: CommandDescriptor;

    beforeEach(() => {
      registerApplicationCommands(mockRegistry);
      command = registeredCommands.get(ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS)!;
    });

    it('should have correct metadata', () => {
      expect(command.id).toBe(ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS);
      expect(command.title).toBe('Keyboard Shortcuts');
      expect(command.category).toBe('View');
    });

    it('should have multi-chord keybinding', () => {
      expect(command.keybinding).toBeDefined();
      expect(command.keybinding).toHaveProperty('key', 'Cmd+K Cmd+S');

      // Should not have platform-specific overrides
      const binding = command.keybinding as any;
      expect(binding.mac).toBeUndefined();
      expect(binding.win).toBeUndefined();
      expect(binding.linux).toBeUndefined();
    });

    it('should call context.view.openKeyboardShortcuts', () => {
      const mockOpenKeyboardShortcuts = vi.fn();
      const mockContext: CommandContext = {
        view: {
          toggleFocusMode: vi.fn(),
          toggleDesignMode: vi.fn(),
          openKeyboardShortcuts: mockOpenKeyboardShortcuts,
        },
        activeTab: null,
        activePaneId: null,
        workspaceName: undefined,
        tabs: null,
        panes: null,
        terminals: null,
        workspaces: null,
        commands: null,
        dialogs: null,
        notifications: null,
        settings: null,
        contextKeys: null,
      };

      command.run(mockContext);

      expect(mockOpenKeyboardShortcuts).toHaveBeenCalledTimes(1);
      expect(mockOpenKeyboardShortcuts).toHaveBeenCalledWith();
    });

    it('should work regardless of activeTab state', () => {
      const mockOpenKeyboardShortcuts = vi.fn();

      // Test with activeTab present
      const mockContextWithTab: CommandContext = {
        view: {
          toggleFocusMode: vi.fn(),
          toggleDesignMode: vi.fn(),
          openKeyboardShortcuts: mockOpenKeyboardShortcuts,
        },
        activeTab: { id: 'tab-123', activePaneId: 'pane-456' },
        activePaneId: 'pane-456',
        workspaceName: undefined,
        tabs: null,
        panes: null,
        terminals: null,
        workspaces: null,
        commands: null,
        dialogs: null,
        notifications: null,
        settings: null,
        contextKeys: null,
      };

      command.run(mockContextWithTab);
      expect(mockOpenKeyboardShortcuts).toHaveBeenCalledTimes(1);

      mockOpenKeyboardShortcuts.mockClear();

      // Test with activeTab null
      const mockContextWithoutTab: CommandContext = {
        view: {
          toggleFocusMode: vi.fn(),
          toggleDesignMode: vi.fn(),
          openKeyboardShortcuts: mockOpenKeyboardShortcuts,
        },
        activeTab: null,
        activePaneId: null,
        workspaceName: undefined,
        tabs: null,
        panes: null,
        terminals: null,
        workspaces: null,
        commands: null,
        dialogs: null,
        notifications: null,
        settings: null,
        contextKeys: null,
      };

      command.run(mockContextWithoutTab);
      expect(mockOpenKeyboardShortcuts).toHaveBeenCalledTimes(1);
    });
  });

  describe('command registration', () => {
    it('should register commands with unique IDs', () => {
      registerApplicationCommands(mockRegistry);

      const commandIds = Array.from(registeredCommands.keys());
      const uniqueIds = new Set(commandIds);

      expect(commandIds.length).toBe(uniqueIds.size);
    });

    it('should assign all commands to View category', () => {
      registerApplicationCommands(mockRegistry);

      const allCommands = Array.from(registeredCommands.values());

      expect(allCommands.length).toBeGreaterThan(0);
      allCommands.forEach(command => {
        expect(command.category).toBe('View');
      });
    });

    it('should assign keybindings to all commands', () => {
      registerApplicationCommands(mockRegistry);

      const allCommands = Array.from(registeredCommands.values());

      allCommands.forEach(command => {
        expect(command.keybinding).toBeDefined();
        expect(command.keybinding).toHaveProperty('key');
      });
    });
  });
});
