import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerApplicationCommands, ApplicationCommands } from '../applicationCommands';
import type { ICommandRegistry } from '../core/CommandRegistry';
import type { CommandDescriptor, CommandContext } from '../core/types';

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
    it('should register both view commands', () => {
      registerApplicationCommands(mockRegistry);

      expect(mockRegistry.registerCommand).toHaveBeenCalledTimes(2);
      expect(registeredCommands.has(ApplicationCommands.VIEW_ENTER_FOCUS_MODE)).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.VIEW_TOGGLE_PANE_CONTROLS)).toBe(true);
    });
  });

  describe('view.enterFocusMode', () => {
    let command: CommandDescriptor;

    beforeEach(() => {
      registerApplicationCommands(mockRegistry);
      command = registeredCommands.get(ApplicationCommands.VIEW_ENTER_FOCUS_MODE)!;
    });

    it('should have correct metadata', () => {
      expect(command.id).toBe(ApplicationCommands.VIEW_ENTER_FOCUS_MODE);
      expect(command.title).toBe('Enter Focus Mode');
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

    it('should call context.view.enterFocusMode when activeTab exists', () => {
      const mockEnterFocusMode = vi.fn();
      const mockContext: CommandContext = {
        view: {
          enterFocusMode: mockEnterFocusMode,
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

      expect(mockEnterFocusMode).toHaveBeenCalledTimes(1);
      expect(mockEnterFocusMode).toHaveBeenCalledWith('tab-123', 'pane-456');
    });

    it('should not call enterFocusMode when activeTab is null', () => {
      const mockEnterFocusMode = vi.fn();
      const mockContext: CommandContext = {
        view: {
          enterFocusMode: mockEnterFocusMode,
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

      expect(mockEnterFocusMode).not.toHaveBeenCalled();
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

      // Should throw when trying to call enterFocusMode on null
      expect(() => command.run(mockContext)).toThrow();
    });
  });

  describe('view.togglePaneControls', () => {
    let command: CommandDescriptor;

    beforeEach(() => {
      registerApplicationCommands(mockRegistry);
      command = registeredCommands.get(ApplicationCommands.VIEW_TOGGLE_PANE_CONTROLS)!;
    });

    it('should have correct metadata', () => {
      expect(command.id).toBe(ApplicationCommands.VIEW_TOGGLE_PANE_CONTROLS);
      expect(command.title).toBe('Toggle Pane Controls');
      expect(command.category).toBe('View');
    });

    it('should have simplified keybinding', () => {
      expect(command.keybinding).toBeDefined();
      expect(command.keybinding).toHaveProperty('key', 'Alt+Space');

      // Should not have platform-specific overrides
      const binding = command.keybinding as any;
      expect(binding.mac).toBeUndefined();
      expect(binding.win).toBeUndefined();
      expect(binding.linux).toBeUndefined();
    });

    it('should call context.view.togglePaneControls', () => {
      const mockTogglePaneControls = vi.fn();
      const mockContext: CommandContext = {
        view: {
          enterFocusMode: vi.fn(),
          togglePaneControls: mockTogglePaneControls,
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

      expect(mockTogglePaneControls).toHaveBeenCalledTimes(1);
      expect(mockTogglePaneControls).toHaveBeenCalledWith();
    });

    it('should work regardless of activeTab state', () => {
      const mockTogglePaneControls = vi.fn();

      // Test with activeTab present
      const mockContextWithTab: CommandContext = {
        view: {
          enterFocusMode: vi.fn(),
          togglePaneControls: mockTogglePaneControls,
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
      expect(mockTogglePaneControls).toHaveBeenCalledTimes(1);

      mockTogglePaneControls.mockClear();

      // Test with activeTab null
      const mockContextWithoutTab: CommandContext = {
        view: {
          enterFocusMode: vi.fn(),
          togglePaneControls: mockTogglePaneControls,
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
      expect(mockTogglePaneControls).toHaveBeenCalledTimes(1);
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
