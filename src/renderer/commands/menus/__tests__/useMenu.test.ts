/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMenu } from '../useMenu';
import { MenuRegistry } from '../MenuRegistry';
import { MenuId } from '../types';
import { ContextKeyService } from '../../contextKeys/ContextKeyServiceImpl';
import { CommandRegistry } from '../../core/CommandRegistryImpl';
import { ContextKey } from '../../contextKeys/ContextKey';
import { ContextLevel } from '../../contextKeys/types';
import { When } from '../../whenClauses/When';

describe('useMenu', () => {
  let menuRegistry: MenuRegistry;
  let contextKeyService: ContextKeyService;
  let commandRegistry: CommandRegistry;

  beforeEach(() => {
    menuRegistry = new MenuRegistry();
    contextKeyService = new ContextKeyService();
    commandRegistry = new CommandRegistry(contextKeyService);
  });

  it('should return empty array when no items', () => {
    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current).toEqual([]);
  });

  it('should return all items when no when clauses', () => {
    commandRegistry.registerCommand({
      id: 'command1',
      title: 'Command 1',
      run: () => {}
    });
    commandRegistry.registerCommand({
      id: 'command2',
      title: 'Command 2',
      run: () => {}
    });

    menuRegistry.register('command1', { id: MenuId.CommandPalette });
    menuRegistry.register('command2', { id: MenuId.CommandPalette });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0].commandId).toBe('command1');
    expect(result.current[1].commandId).toBe('command2');
  });

  it('should filter items by menu when clause', () => {
    const contextKey = new ContextKey('isActive', false, { level: ContextLevel.Global });
    contextKeyService.registerKey(contextKey);
    contextKeyService.setGlobal('isActive', false);

    commandRegistry.registerCommand({
      id: 'command1',
      title: 'Command 1',
      run: () => {}
    });
    commandRegistry.registerCommand({
      id: 'command2',
      title: 'Command 2',
      run: () => {}
    });

    menuRegistry.register('command1', {
      id: MenuId.CommandPalette,
      when: contextKey.isTrue()
    });
    menuRegistry.register('command2', { id: MenuId.CommandPalette });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    // Only command2 should be visible (command1 filtered by when clause)
    expect(result.current).toHaveLength(1);
    expect(result.current[0].commandId).toBe('command2');
  });

  it('should show item when menu when clause is true', () => {
    const contextKey = new ContextKey('isActive', true, { level: ContextLevel.Global });
    contextKeyService.registerKey(contextKey);
    contextKeyService.setGlobal('isActive', true);

    commandRegistry.registerCommand({
      id: 'command1',
      title: 'Command 1',
      run: () => {}
    });

    menuRegistry.register('command1', {
      id: MenuId.CommandPalette,
      when: contextKey.isTrue()
    });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].commandId).toBe('command1');
  });

  it('should set enabled based on command when clause', () => {
    const contextKey = new ContextKey('canExecute', false, { level: ContextLevel.Global });
    contextKeyService.registerKey(contextKey);
    contextKeyService.setGlobal('canExecute', false);

    commandRegistry.registerCommand({
      id: 'command1',
      title: 'Command 1',
      when: contextKey.isTrue(),
      run: () => {}
    });

    menuRegistry.register('command1', { id: MenuId.CommandPalette });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].enabled).toBe(false);
  });

  it('should set enabled to true when command when clause is true', () => {
    const contextKey = new ContextKey('canExecute', true, { level: ContextLevel.Global });
    contextKeyService.registerKey(contextKey);
    contextKeyService.setGlobal('canExecute', true);

    commandRegistry.registerCommand({
      id: 'command1',
      title: 'Command 1',
      when: contextKey.isTrue(),
      run: () => {}
    });

    menuRegistry.register('command1', { id: MenuId.CommandPalette });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].enabled).toBe(true);
  });

  it('should set enabled to true when no command when clause', () => {
    commandRegistry.registerCommand({
      id: 'command1',
      title: 'Command 1',
      run: () => {}
    });

    menuRegistry.register('command1', { id: MenuId.CommandPalette });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].enabled).toBe(true);
  });

  it('should include command title', () => {
    commandRegistry.registerCommand({
      id: 'command1',
      title: 'My Awesome Command',
      run: () => {}
    });

    menuRegistry.register('command1', { id: MenuId.CommandPalette });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current[0].title).toBe('My Awesome Command');
  });

  it('should include menu icon', () => {
    commandRegistry.registerCommand({
      id: 'command1',
      title: 'Command 1',
      run: () => {}
    });

    menuRegistry.register('command1', {
      id: MenuId.CommandPalette,
      icon: 'test-icon'
    });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current[0].icon).toBe('test-icon');
  });

  it('should include group in result', () => {
    commandRegistry.registerCommand({
      id: 'command1',
      title: 'Command 1',
      run: () => {}
    });

    menuRegistry.register('command1', {
      id: MenuId.CommandPalette,
      group: 'navigation'
    });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current[0].group).toBe('navigation');
  });

  it('should return items sorted by group and order', () => {
    commandRegistry.registerCommand({ id: 'cmd1', title: 'Command 1', run: () => {} });
    commandRegistry.registerCommand({ id: 'cmd2', title: 'Command 2', run: () => {} });
    commandRegistry.registerCommand({ id: 'cmd3', title: 'Command 3', run: () => {} });

    menuRegistry.register('cmd1', { id: MenuId.CommandPalette, group: 'z', order: 1 });
    menuRegistry.register('cmd2', { id: MenuId.CommandPalette, group: 'a', order: 2 });
    menuRegistry.register('cmd3', { id: MenuId.CommandPalette, group: 'a', order: 1 });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current[0].commandId).toBe('cmd3'); // group 'a', order 1
    expect(result.current[1].commandId).toBe('cmd2'); // group 'a', order 2
    expect(result.current[2].commandId).toBe('cmd1'); // group 'z', order 1
  });

  it('should use commandId as title when command not found', () => {
    menuRegistry.register('nonexistent.command', { id: MenuId.CommandPalette });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current[0].title).toBe('nonexistent.command');
  });

  it('should handle complex when clauses', () => {
    const key1 = new ContextKey('key1', true, { level: ContextLevel.Global });
    const key2 = new ContextKey('key2', false, { level: ContextLevel.Global });
    contextKeyService.registerKey(key1);
    contextKeyService.registerKey(key2);
    contextKeyService.setGlobal('key1', true);
    contextKeyService.setGlobal('key2', false);

    commandRegistry.registerCommand({
      id: 'command1',
      title: 'Command 1',
      run: () => {}
    });

    // Menu when: key1 && !key2 (should be true)
    menuRegistry.register('command1', {
      id: MenuId.CommandPalette,
      when: When.and(key1.isTrue(), When.not(key2.isTrue()))
    });

    const { result } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(result.current).toHaveLength(1);
  });

  it('should handle different menu IDs separately', () => {
    commandRegistry.registerCommand({ id: 'cmd1', title: 'Command 1', run: () => {} });
    commandRegistry.registerCommand({ id: 'cmd2', title: 'Command 2', run: () => {} });

    menuRegistry.register('cmd1', { id: MenuId.CommandPalette });
    menuRegistry.register('cmd2', { id: MenuId.PaneContext });

    const { result: paletteResult } = renderHook(() =>
      useMenu(MenuId.CommandPalette, menuRegistry, contextKeyService, commandRegistry)
    );

    const { result: paneResult } = renderHook(() =>
      useMenu(MenuId.PaneContext, menuRegistry, contextKeyService, commandRegistry)
    );

    expect(paletteResult.current).toHaveLength(1);
    expect(paletteResult.current[0].commandId).toBe('cmd1');
    expect(paneResult.current).toHaveLength(1);
    expect(paneResult.current[0].commandId).toBe('cmd2');
  });
});
