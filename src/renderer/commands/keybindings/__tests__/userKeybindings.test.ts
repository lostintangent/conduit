/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadUserKeybindings } from '../userKeybindings';
import { KeybindingRegistry } from '../KeybindingRegistry';

describe('loadUserKeybindings', () => {
  let registry: KeybindingRegistry;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalConduit: typeof window.conduit;

  beforeEach(() => {
    registry = new KeybindingRegistry();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalConduit = window.conduit;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    window.conduit = originalConduit;
  });

  it('should read file and register keybindings', async () => {
    const mockReadFile = vi.fn().mockResolvedValue(
      JSON.stringify([
        { key: 'Ctrl+T', command: 'test.command' },
        { key: 'Cmd+P', command: 'palette.open' }
      ])
    );

    window.conduit = {
      readFile: mockReadFile
    };

    await loadUserKeybindings(registry, '/path/to/keybindings.json');

    expect(mockReadFile).toHaveBeenCalledWith('/path/to/keybindings.json');
    expect(registry.getKeybindingsForCommand('test.command')).toHaveLength(1);
    expect(registry.getKeybindingsForCommand('palette.open')).toHaveLength(1);
  });

  it('should apply high weight to user keybindings', async () => {
    const mockReadFile = vi.fn().mockResolvedValue(
      JSON.stringify([{ key: 'Ctrl+T', command: 'test.command' }])
    );

    window.conduit = {
      readFile: mockReadFile
    };

    await loadUserKeybindings(registry, '/path/to/keybindings.json');

    const keybindings = registry.getKeybindingsForCommand('test.command');
    expect(keybindings[0].weight).toBe(1000);
  });

  it('should handle removal bindings', async () => {
    // Register a default keybinding
    registry.register('test.command', { key: 'Ctrl+T' }, 0);
    expect(registry.getKeybindingsForCommand('test.command')).toHaveLength(1);

    const mockReadFile = vi.fn().mockResolvedValue(
      JSON.stringify([{ key: '', command: '-test.command' }])
    );

    window.conduit = {
      readFile: mockReadFile
    };

    await loadUserKeybindings(registry, '/path/to/keybindings.json');

    // Keybinding should be removed
    expect(registry.getKeybindingsForCommand('test.command')).toHaveLength(0);
  });

  it('should handle file read error', async () => {
    const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));

    window.conduit = {
      readFile: mockReadFile
    };

    await loadUserKeybindings(registry, '/path/to/keybindings.json');

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return early when readFile returns null', async () => {
    const mockReadFile = vi.fn().mockResolvedValue(null);

    window.conduit = {
      readFile: mockReadFile
    };

    await loadUserKeybindings(registry, '/path/to/keybindings.json');

    expect(mockReadFile).toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return early when window.conduit is undefined', async () => {
    window.conduit = undefined;

    await loadUserKeybindings(registry, '/path/to/keybindings.json');

    // Should not throw or log errors
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return early when readFile is undefined', async () => {
    window.conduit = {};

    await loadUserKeybindings(registry, '/path/to/keybindings.json');

    // Should not throw or log errors
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle invalid JSON gracefully', async () => {
    const mockReadFile = vi.fn().mockResolvedValue('invalid json {]');

    window.conduit = {
      readFile: mockReadFile
    };

    await loadUserKeybindings(registry, '/path/to/keybindings.json');

    // parseKeybindingsFile will log error and return empty array
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should handle multiple keybindings including removals', async () => {
    // Register some default keybindings
    registry.register('cmd1', { key: 'Ctrl+1' }, 0);
    registry.register('cmd2', { key: 'Ctrl+2' }, 0);
    registry.register('cmd3', { key: 'Ctrl+3' }, 0);

    const mockReadFile = vi.fn().mockResolvedValue(
      JSON.stringify([
        { key: 'Alt+1', command: 'cmd1' }, // Override cmd1
        { key: '', command: '-cmd2' }, // Remove cmd2
        { key: 'Shift+4', command: 'cmd4' } // Add new cmd4
      ])
    );

    window.conduit = {
      readFile: mockReadFile
    };

    await loadUserKeybindings(registry, '/path/to/keybindings.json');

    // cmd1 should have 2 keybindings (default + user)
    expect(registry.getKeybindingsForCommand('cmd1').length).toBeGreaterThan(0);
    // cmd2 should be removed
    expect(registry.getKeybindingsForCommand('cmd2')).toHaveLength(0);
    // cmd3 should still exist
    expect(registry.getKeybindingsForCommand('cmd3')).toHaveLength(1);
    // cmd4 should be added
    expect(registry.getKeybindingsForCommand('cmd4')).toHaveLength(1);
  });
});
