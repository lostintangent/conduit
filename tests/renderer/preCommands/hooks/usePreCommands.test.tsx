/**
 * Unit tests for usePreCommands hooks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePreCommands, usePreCommand } from '@/preCommands/hooks/usePreCommands';
import { PreCommandRegistry } from '@/preCommands/registry';
import type { PreCommand } from '@/preCommands/types';

describe('usePreCommands', () => {
  beforeEach(() => {
    // Clear registry before each test
    PreCommandRegistry.getInstance().clear();
  });

  describe('basic functionality', () => {
    it('should return empty array when no commands registered', () => {
      const { result } = renderHook(() => usePreCommands());

      expect(result.current).toEqual([]);
    });

    it('should return all registered commands', () => {
      const command1: PreCommand = {
        id: 'command-1',
        label: 'Command 1',
        run: async () => ({ success: true }),
      };

      const command2: PreCommand = {
        id: 'command-2',
        label: 'Command 2',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command1);
      registry.register(command2);

      const { result } = renderHook(() => usePreCommands());

      expect(result.current).toHaveLength(2);
      expect(result.current).toContain(command1);
      expect(result.current).toContain(command2);
    });

    it('should return commands in order they were registered', () => {
      const commands: PreCommand[] = [
        { id: 'cmd-1', label: 'Command 1', run: async () => ({ success: true }) },
        { id: 'cmd-2', label: 'Command 2', run: async () => ({ success: true }) },
        { id: 'cmd-3', label: 'Command 3', run: async () => ({ success: true }) },
      ];

      const registry = PreCommandRegistry.getInstance();
      commands.forEach(cmd => registry.register(cmd));

      const { result } = renderHook(() => usePreCommands());

      expect(result.current.map(c => c.id)).toEqual(['cmd-1', 'cmd-2', 'cmd-3']);
    });
  });

  describe('memoization', () => {
    it('should return same array reference if registry unchanged', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result, rerender } = renderHook(() => usePreCommands());

      const firstResult = result.current;
      rerender();
      const secondResult = result.current;

      expect(firstResult).toBe(secondResult); // Same reference due to memoization
    });

    it('should not re-create array on re-render', () => {
      const registry = PreCommandRegistry.getInstance();
      registry.register({
        id: 'test-command',
        label: 'Test',
        run: async () => ({ success: true }),
      });

      const { result, rerender } = renderHook(() => usePreCommands());

      const arrays: unknown[] = [];
      arrays.push(result.current);

      for (let i = 0; i < 5; i++) {
        rerender();
        arrays.push(result.current);
      }

      // All should be the same reference
      arrays.forEach(arr => {
        expect(arr).toBe(arrays[0]);
      });
    });
  });

  describe('with descriptions', () => {
    it('should return commands with descriptions', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        description: 'This is a test command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result } = renderHook(() => usePreCommands());

      expect(result.current[0].description).toBe('This is a test command');
    });

    it('should handle commands without descriptions', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result } = renderHook(() => usePreCommands());

      expect(result.current[0].description).toBeUndefined();
    });
  });
});

describe('usePreCommand', () => {
  beforeEach(() => {
    // Clear registry before each test
    PreCommandRegistry.getInstance().clear();
  });

  describe('basic functionality', () => {
    it('should return undefined when no ID provided', () => {
      const { result } = renderHook(() => usePreCommand(undefined));

      expect(result.current).toBeUndefined();
    });

    it('should return undefined when ID is empty string', () => {
      const { result } = renderHook(() => usePreCommand(''));

      expect(result.current).toBeUndefined();
    });

    it('should return undefined when command not found', () => {
      const { result } = renderHook(() => usePreCommand('non-existent'));

      expect(result.current).toBeUndefined();
    });

    it('should return the command when found', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result } = renderHook(() => usePreCommand('test-command'));

      expect(result.current).toBe(command);
    });

    it('should return correct command when multiple registered', () => {
      const command1: PreCommand = {
        id: 'command-1',
        label: 'Command 1',
        run: async () => ({ success: true }),
      };

      const command2: PreCommand = {
        id: 'command-2',
        label: 'Command 2',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command1);
      registry.register(command2);

      const { result } = renderHook(() => usePreCommand('command-2'));

      expect(result.current).toBe(command2);
    });
  });

  describe('memoization', () => {
    it('should return same reference if ID unchanged', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result, rerender } = renderHook(() => usePreCommand('test-command'));

      const firstResult = result.current;
      rerender();
      const secondResult = result.current;

      expect(firstResult).toBe(secondResult); // Same reference due to memoization
    });

    it('should update when ID changes', () => {
      const command1: PreCommand = {
        id: 'command-1',
        label: 'Command 1',
        run: async () => ({ success: true }),
      };

      const command2: PreCommand = {
        id: 'command-2',
        label: 'Command 2',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command1);
      registry.register(command2);

      const { result, rerender } = renderHook(
        ({ id }) => usePreCommand(id),
        { initialProps: { id: 'command-1' } }
      );

      expect(result.current).toBe(command1);

      rerender({ id: 'command-2' });

      expect(result.current).toBe(command2);
    });

    it('should return undefined when ID changes to non-existent', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result, rerender } = renderHook(
        ({ id }) => usePreCommand(id),
        { initialProps: { id: 'test-command' } }
      );

      expect(result.current).toBe(command);

      rerender({ id: 'non-existent' });

      expect(result.current).toBeUndefined();
    });

    it('should return undefined when ID changes from valid to undefined', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result, rerender } = renderHook(
        ({ id }) => usePreCommand(id),
        { initialProps: { id: 'test-command' as string | undefined } }
      );

      expect(result.current).toBe(command);

      rerender({ id: undefined });

      expect(result.current).toBeUndefined();
    });
  });

  describe('with descriptions', () => {
    it('should return command with description', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        description: 'This is a test command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result } = renderHook(() => usePreCommand('test-command'));

      expect(result.current?.description).toBe('This is a test command');
    });

    it('should handle command without description', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result } = renderHook(() => usePreCommand('test-command'));

      expect(result.current?.description).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in ID', () => {
      const specialId = 'test-command_123.foo@bar';

      const command: PreCommand = {
        id: specialId,
        label: 'Special ID',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result } = renderHook(() => usePreCommand(specialId));

      expect(result.current).toBe(command);
    });

    it('should handle rapid ID changes', () => {
      const commands = Array.from({ length: 10 }, (_, i) => ({
        id: `command-${i}`,
        label: `Command ${i}`,
        run: async () => ({ success: true }),
      }));

      const registry = PreCommandRegistry.getInstance();
      commands.forEach(cmd => registry.register(cmd));

      const { result, rerender } = renderHook(
        ({ id }) => usePreCommand(id),
        { initialProps: { id: 'command-0' } }
      );

      // Rapidly change IDs
      for (let i = 1; i < 10; i++) {
        rerender({ id: `command-${i}` });
        expect(result.current?.id).toBe(`command-${i}`);
      }
    });

    it('should not re-create result on unrelated re-renders', () => {
      const command: PreCommand = {
        id: 'test-command',
        label: 'Test Command',
        run: async () => ({ success: true }),
      };

      const registry = PreCommandRegistry.getInstance();
      registry.register(command);

      const { result, rerender } = renderHook(
        ({ id, unrelated }) => usePreCommand(id),
        { initialProps: { id: 'test-command', unrelated: 0 } }
      );

      const firstResult = result.current;

      // Re-render with different unrelated prop
      rerender({ id: 'test-command', unrelated: 1 });

      expect(result.current).toBe(firstResult); // Should be same reference
    });
  });
});
