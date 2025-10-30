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
});
