import { describe, it, expect, beforeEach } from 'vitest';
import { MenuRegistry } from '../MenuRegistry';
import { MenuId } from '../types';
import type { MenuContribution } from '../types';
import { When } from '../../whenClauses/When';

describe('MenuRegistry', () => {
  let registry: MenuRegistry;

  beforeEach(() => {
    registry = new MenuRegistry();
  });

  describe('register()', () => {
    it('should register a menu item', () => {
      const contribution: MenuContribution = {
        id: MenuId.CommandPalette
      };

      registry.register('test.command', contribution);

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items).toHaveLength(1);
      expect(items[0].commandId).toBe('test.command');
    });

    it('should register in multiple menus', () => {
      registry.register('test.command1', { id: MenuId.CommandPalette });
      registry.register('test.command2', { id: MenuId.PaneContext });

      expect(registry.getMenuItems(MenuId.CommandPalette)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.PaneContext)).toHaveLength(1);
    });

    it('should set default group when not specified', () => {
      registry.register('test.command', { id: MenuId.CommandPalette });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].group).toBe('default');
    });

    it('should use specified group', () => {
      registry.register('test.command', {
        id: MenuId.CommandPalette,
        group: 'navigation'
      });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].group).toBe('navigation');
    });

    it('should set default order to 0 when not specified', () => {
      registry.register('test.command', { id: MenuId.CommandPalette });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].order).toBe(0);
    });

    it('should use specified order', () => {
      registry.register('test.command', {
        id: MenuId.CommandPalette,
        order: 10
      });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].order).toBe(10);
    });

    it('should preserve when clause', () => {
      const whenClause = When.always();
      registry.register('test.command', {
        id: MenuId.CommandPalette,
        when: whenClause
      });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].when).toBe(whenClause);
    });

    it('should preserve icon', () => {
      registry.register('test.command', {
        id: MenuId.CommandPalette,
        icon: 'test-icon'
      });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].icon).toBe('test-icon');
    });

    it('should allow multiple commands in same menu', () => {
      registry.register('command1', { id: MenuId.CommandPalette });
      registry.register('command2', { id: MenuId.CommandPalette });
      registry.register('command3', { id: MenuId.CommandPalette });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items).toHaveLength(3);
    });
  });

  describe('getMenuItems()', () => {
    it('should return empty array for menu with no items', () => {
      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items).toEqual([]);
    });

    it('should return all items for a menu', () => {
      registry.register('command1', { id: MenuId.CommandPalette });
      registry.register('command2', { id: MenuId.CommandPalette });
      registry.register('command3', { id: MenuId.PaneContext });

      const paletteItems = registry.getMenuItems(MenuId.CommandPalette);
      expect(paletteItems).toHaveLength(2);
    });

    it('should not affect items when retrieved', () => {
      registry.register('command1', { id: MenuId.CommandPalette });

      const items1 = registry.getMenuItems(MenuId.CommandPalette);
      const items2 = registry.getMenuItems(MenuId.CommandPalette);

      expect(items1).toHaveLength(1);
      expect(items2).toHaveLength(1);
    });
  });

  describe('getSortedMenuItems()', () => {
    it('should sort by group alphabetically', () => {
      registry.register('command1', {
        id: MenuId.CommandPalette,
        group: 'z_last'
      });
      registry.register('command2', {
        id: MenuId.CommandPalette,
        group: 'a_first'
      });
      registry.register('command3', {
        id: MenuId.CommandPalette,
        group: 'm_middle'
      });

      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      expect(items[0].commandId).toBe('command2');
      expect(items[1].commandId).toBe('command3');
      expect(items[2].commandId).toBe('command1');
    });

    it('should sort by order within same group', () => {
      registry.register('command1', {
        id: MenuId.CommandPalette,
        group: 'edit',
        order: 30
      });
      registry.register('command2', {
        id: MenuId.CommandPalette,
        group: 'edit',
        order: 10
      });
      registry.register('command3', {
        id: MenuId.CommandPalette,
        group: 'edit',
        order: 20
      });

      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      expect(items[0].commandId).toBe('command2');
      expect(items[1].commandId).toBe('command3');
      expect(items[2].commandId).toBe('command1');
    });

    it('should sort by group first, then order', () => {
      registry.register('command1', {
        id: MenuId.CommandPalette,
        group: 'navigation',
        order: 1
      });
      registry.register('command2', {
        id: MenuId.CommandPalette,
        group: 'edit',
        order: 100
      });
      registry.register('command3', {
        id: MenuId.CommandPalette,
        group: 'navigation',
        order: 2
      });

      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      // 'edit' comes before 'navigation' alphabetically
      expect(items[0].commandId).toBe('command2');
      expect(items[1].commandId).toBe('command1');
      expect(items[2].commandId).toBe('command3');
    });

    it('should handle negative order values', () => {
      registry.register('command1', {
        id: MenuId.CommandPalette,
        group: 'edit',
        order: 10
      });
      registry.register('command2', {
        id: MenuId.CommandPalette,
        group: 'edit',
        order: -5
      });

      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      expect(items[0].commandId).toBe('command2');
      expect(items[1].commandId).toBe('command1');
    });

    it('should return empty array for menu with no items', () => {
      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      expect(items).toEqual([]);
    });
  });

  describe('clear()', () => {
    it('should clear all menus', () => {
      registry.register('command1', { id: MenuId.CommandPalette });
      registry.register('command2', { id: MenuId.PaneContext });
      registry.register('command3', { id: MenuId.TabContext });

      registry.clear();

      expect(registry.getMenuItems(MenuId.CommandPalette)).toEqual([]);
      expect(registry.getMenuItems(MenuId.PaneContext)).toEqual([]);
      expect(registry.getMenuItems(MenuId.TabContext)).toEqual([]);
    });
  });

  describe('all menu types', () => {
    it('should support all menu IDs', () => {
      registry.register('cmd1', { id: MenuId.CommandPalette });
      registry.register('cmd2', { id: MenuId.PaneContext });
      registry.register('cmd3', { id: MenuId.TabContext });
      registry.register('cmd4', { id: MenuId.TitleBar });
      registry.register('cmd5', { id: MenuId.EditorContext });
      registry.register('cmd6', { id: MenuId.TerminalContext });

      expect(registry.getMenuItems(MenuId.CommandPalette)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.PaneContext)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.TabContext)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.TitleBar)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.EditorContext)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.TerminalContext)).toHaveLength(1);
    });
  });
});
