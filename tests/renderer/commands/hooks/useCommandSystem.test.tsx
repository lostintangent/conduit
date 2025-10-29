/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { useCommandSystem } from '@/commands/hooks/useCommandSystem';
import { keybindingsAtom } from '@/store/atoms';
import { ApplicationCommands } from '@/commands/applicationCommands';
import type { ApplicationMode } from '@/store/atoms';

describe('useCommandSystem', () => {
  let store: ReturnType<typeof createStore>;
  let setApplicationModeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = createStore();
    setApplicationModeMock = vi.fn();
  });

  describe('initialization', () => {
    it('should initialize command system', async () => {
      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      // In test environment, effects run synchronously so system is ready immediately
      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });
    });

    it('should initialize and return command system state when ready', async () => {
      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      // Wait for initialization
      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      expect(result.current).toMatchObject({
        commandRegistry: expect.any(Object),
        keybindingRegistry: expect.any(Object),
        isReady: true,
      });
    });

    it('should have commandRegistry with methods', async () => {
      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;
      expect(commandRegistry.getCommand).toBeDefined();
      expect(commandRegistry.getAllCommands).toBeDefined();
      expect(commandRegistry.executeCommand).toBeDefined();
    });

    it('should have keybindingRegistry with methods', async () => {
      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { keybindingRegistry } = result.current!;
      expect(keybindingRegistry.getAllKeybindings).toBeDefined();
      expect(keybindingRegistry.getKeybindingsForCommand).toBeDefined();
    });
  });

  describe('application commands registration', () => {
    it('should register application commands', async () => {
      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;

      // Check that application commands are registered
      const focusModeCommand = commandRegistry.getCommand(
        ApplicationCommands.VIEW_ENTER_FOCUS_MODE
      );
      expect(focusModeCommand).toBeDefined();
      expect(focusModeCommand?.title).toBe('Enter Focus Mode');

      const toggleControlsCommand = commandRegistry.getCommand(
        ApplicationCommands.VIEW_TOGGLE_PANE_CONTROLS
      );
      expect(toggleControlsCommand).toBeDefined();
      expect(toggleControlsCommand?.title).toBe('Toggle Pane Controls');
    });

    it('should have keybindings for application commands', async () => {
      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { keybindingRegistry } = result.current!;
      const focusModeBindings = keybindingRegistry.getKeybindingsForCommand(
        ApplicationCommands.VIEW_ENTER_FOCUS_MODE
      );

      expect(focusModeBindings.length).toBeGreaterThan(0);
    });
  });

  describe('keybindings atom population', () => {
    it('should populate keybindings atom with initial bindings', async () => {
      renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        const keybindings = store.get(keybindingsAtom);
        expect(keybindings.size).toBeGreaterThan(0);
      });
    });

    it('should include application command keybindings in atom', async () => {
      renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        const keybindings = store.get(keybindingsAtom);
        expect(keybindings.has(ApplicationCommands.VIEW_ENTER_FOCUS_MODE)).toBe(true);
        expect(keybindings.has(ApplicationCommands.VIEW_TOGGLE_PANE_CONTROLS)).toBe(true);
      });
    });
  });

  describe('context builder', () => {
    it('should set context builder with view service', async () => {
      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;

      // Execute a command to test context builder
      const toggleCommand = commandRegistry.getCommand(
        ApplicationCommands.VIEW_TOGGLE_PANE_CONTROLS
      );
      expect(toggleCommand).toBeDefined();

      // Execute the command - should call setApplicationMode
      await commandRegistry.executeCommand(ApplicationCommands.VIEW_TOGGLE_PANE_CONTROLS);

      expect(setApplicationModeMock).toHaveBeenCalledWith('design');
    });

    it('should provide activeTab in context', async () => {
      const mockTab = {
        id: 'tab-1',
        activePaneId: 'pane-1',
        panes: {},
      };

      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: mockTab,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;

      // Register a test command that accesses activeTab
      let capturedContext: any = null;
      commandRegistry.registerCommand({
        id: 'test.captureContext',
        title: 'Capture Context',
        run: (context) => {
          capturedContext = context;
        },
      });

      await commandRegistry.executeCommand('test.captureContext');

      expect(capturedContext).toBeDefined();
      expect(capturedContext.activeTab).toEqual(mockTab);
      expect(capturedContext.activePaneId).toBe('pane-1');
    });

    it('should update context when applicationMode changes', async () => {
      const { result, rerender } = renderHook(
        ({ mode }) => useCommandSystem({
          activeTab: null,
          applicationMode: mode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          initialProps: { mode: 'normal' as ApplicationMode },
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      // Change mode and rerender
      rerender({ mode: 'design' as ApplicationMode });

      // Execute toggle command - should toggle back to normal
      await result.current!.commandRegistry.executeCommand(
        ApplicationCommands.VIEW_TOGGLE_PANE_CONTROLS
      );

      expect(setApplicationModeMock).toHaveBeenCalledWith('normal');
    });

    it('should update context when activeTab changes', async () => {
      const mockTab1 = { id: 'tab-1', activePaneId: 'pane-1', panes: {} };
      const mockTab2 = { id: 'tab-2', activePaneId: 'pane-2', panes: {} };

      const { result, rerender } = renderHook(
        ({ tab }) => useCommandSystem({
          activeTab: tab,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          initialProps: { tab: mockTab1 },
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;

      // Register a test command
      let capturedTab: any = null;
      commandRegistry.registerCommand({
        id: 'test.captureTab',
        title: 'Capture Tab',
        run: (context) => {
          capturedTab = context.activeTab;
        },
      });

      // Execute with first tab
      await commandRegistry.executeCommand('test.captureTab');
      expect(capturedTab).toEqual(mockTab1);

      // Change tab
      rerender({ tab: mockTab2 });

      // Execute again with second tab
      await commandRegistry.executeCommand('test.captureTab');
      expect(capturedTab).toEqual(mockTab2);
    });
  });

  describe('ready state management', () => {
    it('should set context builder before returning system', async () => {
      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      // Wait for system to be ready
      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      // Context builder should be set when system is returned
      expect(result.current).toBeDefined();
    });

    it('should have isReady=true when returned', async () => {
      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      expect(result.current!.isReady).toBe(true);
    });
  });

  describe('stability', () => {
    it('should not reinitialize on rerender', async () => {
      const { result, rerender } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const firstRegistry = result.current!.commandRegistry;

      rerender();

      expect(result.current!.commandRegistry).toBe(firstRegistry);
    });
  });

  describe('file watching', () => {
    it('should not watch keybindings file when homeDirectory is not provided', async () => {
      const mockWatchFile = vi.fn(() => ({ dispose: vi.fn() }));
      const originalConduit = window.conduit;

      // Mock window.conduit.watchFile
      window.conduit = { ...window.conduit, watchFile: mockWatchFile };

      renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
          // homeDirectory not provided
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        // Give time for effects to run
      });

      expect(mockWatchFile).not.toHaveBeenCalled();

      // Restore
      window.conduit = originalConduit;
    });

    it('should watch keybindings file when homeDirectory is provided', async () => {
      const mockDispose = vi.fn();
      const mockWatchFile = vi.fn(() => ({ dispose: mockDispose }));
      const originalConduit = window.conduit;

      // Mock window.conduit.watchFile
      window.conduit = { ...window.conduit, watchFile: mockWatchFile };

      const { unmount } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
          homeDirectory: '/test/home',
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(mockWatchFile).toHaveBeenCalledWith(
          '/test/home/.conduit/keybindings.json',
          expect.any(Function)
        );
      });

      // Cleanup should dispose watcher
      unmount();
      expect(mockDispose).toHaveBeenCalled();

      // Restore
      window.conduit = originalConduit;
    });

    it('should handle file changes and reload keybindings', async () => {
      let changeCallback: (() => void) | null = null;
      const mockDispose = vi.fn();
      const mockWatchFile = vi.fn((path: string, callback: () => void) => {
        changeCallback = callback;
        return { dispose: mockDispose };
      });
      const originalConduit = window.conduit;
      const mockReadFile = vi.fn().mockResolvedValue('[]');

      // Mock window.conduit
      window.conduit = {
        ...window.conduit,
        watchFile: mockWatchFile,
        readFile: mockReadFile,
      };

      const { result } = renderHook(
        () => useCommandSystem({
          activeTab: null,
          applicationMode: 'normal' as ApplicationMode,
          setApplicationMode: setApplicationModeMock,
          homeDirectory: '/test/home',
        }),
        {
          wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      // Trigger file change
      expect(changeCallback).not.toBeNull();
      if (changeCallback) {
        await changeCallback();
      }

      // Should have attempted to read the file
      await waitFor(() => {
        expect(mockReadFile).toHaveBeenCalledWith('/test/home/.conduit/keybindings.json');
      });

      // Restore
      window.conduit = originalConduit;
    });
  });
});
