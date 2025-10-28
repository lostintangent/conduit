/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { watchKeybindingsFile } from '../watchKeybindings';

describe('watchKeybindingsFile', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let originalConduit: typeof window.conduit;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    originalConduit = window.conduit;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    window.conduit = originalConduit;
  });

  it('should set up file watcher', () => {
    const mockDispose = vi.fn();
    const mockWatchFile = vi.fn().mockReturnValue({ dispose: mockDispose });

    window.conduit = {
      watchFile: mockWatchFile
    };

    const callback = vi.fn();
    watchKeybindingsFile('/path/to/keybindings.json', callback);

    expect(mockWatchFile).toHaveBeenCalledWith(
      '/path/to/keybindings.json',
      expect.any(Function)
    );
  });

  it('should call callback when file changes', () => {
    let watchCallback: (() => void) | undefined;
    const mockWatchFile = vi.fn().mockImplementation((path, cb) => {
      watchCallback = cb;
      return { dispose: vi.fn() };
    });

    window.conduit = {
      watchFile: mockWatchFile
    };

    const callback = vi.fn();
    watchKeybindingsFile('/path/to/keybindings.json', callback);

    // Simulate file change
    watchCallback?.();

    expect(callback).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('Keybindings file changed, reloading...');
  });

  it('should return cleanup function', () => {
    const mockDispose = vi.fn();
    const mockWatchFile = vi.fn().mockReturnValue({ dispose: mockDispose });

    window.conduit = {
      watchFile: mockWatchFile
    };

    const cleanup = watchKeybindingsFile('/path/to/keybindings.json', vi.fn());

    cleanup();

    expect(mockDispose).toHaveBeenCalled();
  });

  it('should handle undefined window.conduit', () => {
    window.conduit = undefined;

    const cleanup = watchKeybindingsFile('/path/to/keybindings.json', vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    cleanup(); // Should not throw
  });

  it('should handle undefined watchFile', () => {
    window.conduit = {};

    const cleanup = watchKeybindingsFile('/path/to/keybindings.json', vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    cleanup(); // Should not throw
  });

  it('should handle watchFile returning undefined', () => {
    const mockWatchFile = vi.fn().mockReturnValue(undefined);

    window.conduit = {
      watchFile: mockWatchFile
    };

    const cleanup = watchKeybindingsFile('/path/to/keybindings.json', vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    cleanup(); // Should not throw
  });

  it('should log on file change', () => {
    let watchCallback: (() => void) | undefined;
    const mockWatchFile = vi.fn().mockImplementation((path, cb) => {
      watchCallback = cb;
      return { dispose: vi.fn() };
    });

    window.conduit = {
      watchFile: mockWatchFile
    };

    watchKeybindingsFile('/path/to/keybindings.json', vi.fn());

    watchCallback?.();

    expect(consoleLogSpy).toHaveBeenCalledWith('Keybindings file changed, reloading...');
  });
});
