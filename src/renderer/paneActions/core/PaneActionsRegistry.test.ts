/**
 * Unit tests for PaneActionsRegistry
 */

import { describe, it, expect, vi } from 'vitest';
import { PaneActionsRegistry } from './PaneActionsRegistry';
import type { Action } from './types';

describe('PaneActionsRegistry', () => {
  describe('initialization', () => {
    it('should initialize with default actions', () => {
      const registry = new PaneActionsRegistry();
      const actions = registry.getActions();

      expect(actions).toHaveLength(4);
      expect(actions[0].name).toBe('Source Control');
      expect(actions[1].name).toBe('Editor');
      expect(actions[2].name).toBe('Agent');
      expect(actions[3].name).toBe('Browser');
    });
  });

  describe('getActions', () => {
    it('should return a copy of actions (immutability)', () => {
      const registry = new PaneActionsRegistry();
      const actions1 = registry.getActions();
      const actions2 = registry.getActions();

      // Should be different array instances
      expect(actions1).not.toBe(actions2);

      // But contain the same data
      expect(actions1).toEqual(actions2);
    });

    it('should not allow external mutation of internal state', () => {
      const registry = new PaneActionsRegistry();
      const actions = registry.getActions();

      // Mutate the returned array
      actions.push({
        name: 'Test',
        icon: 'test',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'test' },
      });

      // Internal state should be unchanged
      const internalActions = registry.getActions();
      expect(internalActions).toHaveLength(4);
    });
  });

  describe('setActions', () => {
    it('should replace current actions', () => {
      const registry = new PaneActionsRegistry();

      const newActions: Action[] = [
        {
          name: 'Custom Action',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'echo hello' },
        },
      ];

      registry.setActions(newActions);

      const actions = registry.getActions();
      expect(actions).toHaveLength(1);
      expect(actions[0].name).toBe('Custom Action');
    });

    it('should notify listeners when actions change', () => {
      const registry = new PaneActionsRegistry();
      const listener = vi.fn();

      registry.onChange(listener);

      const newActions: Action[] = [
        {
          name: 'Custom Action',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'echo hello' },
        },
      ];

      registry.setActions(newActions);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('onChange', () => {
    it('should register a listener and call it on changes', () => {
      const registry = new PaneActionsRegistry();
      const listener = vi.fn();

      registry.onChange(listener);

      // Listener should not be called yet
      expect(listener).not.toHaveBeenCalled();

      // Trigger change
      registry.setActions([]);

      // Listener should be called once
      expect(listener).toHaveBeenCalledTimes(1);

      // Trigger another change
      registry.setActions([]);

      // Listener should be called again
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should support multiple listeners', () => {
      const registry = new PaneActionsRegistry();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      registry.onChange(listener1);
      registry.onChange(listener2);

      registry.setActions([]);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should return an unsubscribe function', () => {
      const registry = new PaneActionsRegistry();
      const listener = vi.fn();

      const unsubscribe = registry.onChange(listener);

      // Listener should be called on first change
      registry.setActions([]);
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Listener should NOT be called after unsubscribe
      registry.setActions([]);
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should handle unsubscribing non-existent listeners gracefully', () => {
      const registry = new PaneActionsRegistry();
      const listener = vi.fn();

      const unsubscribe = registry.onChange(listener);

      // Unsubscribe twice (should not throw)
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should handle multiple unsubscribes in correct order', () => {
      const registry = new PaneActionsRegistry();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      const unsubscribe1 = registry.onChange(listener1);
      const unsubscribe2 = registry.onChange(listener2);
      const unsubscribe3 = registry.onChange(listener3);

      // All should be called
      registry.setActions([]);
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      // Unsubscribe middle listener
      unsubscribe2();

      // Only 1 and 3 should be called
      registry.setActions([]);
      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(1); // Still 1
      expect(listener3).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveActionByName', () => {
    it('should resolve action by name without overrides', () => {
      const registry = new PaneActionsRegistry();

      const result = registry.resolveActionByName('Source Control', '~/Projects');

      expect(result).not.toBeNull();
      expect(result?.paneType).toBe('terminal');
      expect(result?.config).toEqual({ command: 'git status' });
    });

    it('should return null for non-existent action name', () => {
      const registry = new PaneActionsRegistry();

      const result = registry.resolveActionByName('Non-existent', '~/Projects');

      expect(result).toBeNull();
    });

    it('should resolve action with matching override', () => {
      const registry = new PaneActionsRegistry();

      // Add custom action with override
      registry.setActions([
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'default' },
          overrides: [
            {
              path: '~/Projects',
              config: { command: 'override' },
            },
          ],
        },
      ]);

      const result = registry.resolveActionByName('Test', '~/Projects/test');

      expect(result).not.toBeNull();
      expect(result?.config).toEqual({ command: 'override' });
    });

    it('should use default config when no override matches', () => {
      const registry = new PaneActionsRegistry();

      registry.setActions([
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'default' },
          overrides: [
            {
              path: '~/Projects',
              config: { command: 'override' },
            },
          ],
        },
      ]);

      const result = registry.resolveActionByName('Test', '~/Work');

      expect(result).not.toBeNull();
      expect(result?.config).toEqual({ command: 'default' });
    });
  });

  describe('resolveActionByIndex', () => {
    it('should resolve action by index without overrides', () => {
      const registry = new PaneActionsRegistry();

      // Index 0 should be "Source Control"
      const result = registry.resolveActionByIndex(0, '~/Projects');

      expect(result).not.toBeNull();
      expect(result?.paneType).toBe('terminal');
      expect(result?.config).toEqual({ command: 'git status' });
    });

    it('should return null for out of bounds index', () => {
      const registry = new PaneActionsRegistry();

      const result = registry.resolveActionByIndex(999, '~/Projects');

      expect(result).toBeNull();
    });

    it('should return null for negative index', () => {
      const registry = new PaneActionsRegistry();

      const result = registry.resolveActionByIndex(-1, '~/Projects');

      expect(result).toBeNull();
    });

    it('should resolve action with matching override', () => {
      const registry = new PaneActionsRegistry();

      registry.setActions([
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'default' },
          overrides: [
            {
              path: '~/Projects',
              config: { command: 'override' },
            },
          ],
        },
      ]);

      const result = registry.resolveActionByIndex(0, '~/Projects/test');

      expect(result).not.toBeNull();
      expect(result?.config).toEqual({ command: 'override' });
    });

    it('should handle multiple actions and select correct index', () => {
      const registry = new PaneActionsRegistry();

      registry.setActions([
        {
          name: 'First',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'first' },
        },
        {
          name: 'Second',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'second' },
        },
        {
          name: 'Third',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'third' },
        },
      ]);

      const result1 = registry.resolveActionByIndex(1, '~/Projects');

      expect(result1).not.toBeNull();
      expect(result1?.config).toEqual({ command: 'second' });
    });
  });

  describe('loadFromFile', () => {
    it('should load actions from existing file', async () => {
      const { registry, testFilePath, writeTestFile } = await setupFileTest();

      const actions: Action[] = [
        {
          name: 'Custom',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'custom' },
        },
      ];

      await writeTestFile(actions);

      const loaded = await registry.loadFromFile(testFilePath);

      expect(loaded).toBe(true);
      expect(registry.getActions()).toHaveLength(1);
      expect(registry.getActions()[0].name).toBe('Custom');
    });

    it('should return false for non-existent file', async () => {
      const { registry, testFilePath } = await setupFileTest();

      const loaded = await registry.loadFromFile(testFilePath);

      expect(loaded).toBe(false);
      // Should keep default actions
      expect(registry.getActions()).toHaveLength(4);
    });

    it('should throw for invalid file', async () => {
      const { registry, testFilePath, writeInvalidFile } = await setupFileTest();

      await writeInvalidFile('not valid json');

      await expect(registry.loadFromFile(testFilePath)).rejects.toThrow();
    });

    it('should notify listeners when file is loaded', async () => {
      const { registry, testFilePath, writeTestFile } = await setupFileTest();
      const listener = vi.fn();

      registry.onChange(listener);

      const actions: Action[] = [
        {
          name: 'Custom',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'custom' },
        },
      ];

      await writeTestFile(actions);
      await registry.loadFromFile(testFilePath);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not notify listeners when file does not exist', async () => {
      const { registry, testFilePath } = await setupFileTest();
      const listener = vi.fn();

      registry.onChange(listener);
      await registry.loadFromFile(testFilePath);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('resetToDefaults', () => {
    it('should reset to default actions', () => {
      const registry = new PaneActionsRegistry();

      // Change actions
      registry.setActions([
        {
          name: 'Custom',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'custom' },
        },
      ]);

      expect(registry.getActions()).toHaveLength(1);

      // Reset
      registry.resetToDefaults();

      expect(registry.getActions()).toHaveLength(4);
      expect(registry.getActions()[0].name).toBe('Source Control');
    });

    it('should notify listeners', () => {
      const registry = new PaneActionsRegistry();
      const listener = vi.fn();

      registry.onChange(listener);
      registry.resetToDefaults();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});

// Helper for file-based tests
async function setupFileTest() {
  const { mkdir, rm, writeFile } = await import('fs/promises');
  const { join } = await import('path');
  const { tmpdir } = await import('os');

  const testDir = join(tmpdir(), `pane-actions-registry-test-${Date.now()}`);
  const testFilePath = join(testDir, 'paneactions.json');

  await mkdir(testDir, { recursive: true });

  const registry = new PaneActionsRegistry();

  const cleanup = async () => {
    await rm(testDir, { recursive: true, force: true });
  };

  const writeTestFile = async (actions: Action[]) => {
    await writeFile(testFilePath, JSON.stringify(actions), 'utf-8');
  };

  const writeInvalidFile = async (content: string) => {
    await writeFile(testFilePath, content, 'utf-8');
  };

  // Auto-cleanup after test
  const { afterEach } = await import('vitest');
  afterEach(cleanup);

  return {
    registry,
    testFilePath,
    testDir,
    writeTestFile,
    writeInvalidFile,
    cleanup,
  };
}
