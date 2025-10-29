import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseKeybindingsFile,
  isRemovalBinding,
  getRemovalCommandId
} from '@/commands/keybindings/keybindingsFile';

describe('parseKeybindingsFile', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should parse valid JSON array', () => {
    const json = JSON.stringify([
      { key: 'Ctrl+T', command: 'test.command' },
      { key: 'Cmd+P', command: 'palette.open' }
    ]);

    const result = parseKeybindingsFile(json);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ key: 'Ctrl+T', command: 'test.command' });
    expect(result[1]).toEqual({ key: 'Cmd+P', command: 'palette.open' });
  });

  it('should return empty array for invalid JSON', () => {
    const result = parseKeybindingsFile('invalid json {]');

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return empty array for non-array JSON', () => {
    const json = JSON.stringify({ key: 'Ctrl+T', command: 'test.command' });

    const result = parseKeybindingsFile(json);

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return empty array for empty JSON', () => {
    const result = parseKeybindingsFile('');

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should parse empty array', () => {
    const json = JSON.stringify([]);

    const result = parseKeybindingsFile(json);

    expect(result).toEqual([]);
  });

  it('should preserve additional properties in keybindings', () => {
    const json = JSON.stringify([
      { key: 'Ctrl+T', command: 'test.command', when: 'editorFocus', extra: 'data' }
    ]);

    const result = parseKeybindingsFile(json);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('extra', 'data');
  });
});

describe('isRemovalBinding', () => {
  it('should return true for command starting with -', () => {
    expect(isRemovalBinding('-test.command')).toBe(true);
  });

  it('should return false for command not starting with -', () => {
    expect(isRemovalBinding('test.command')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isRemovalBinding('')).toBe(false);
  });

  it('should return true for command with only -', () => {
    expect(isRemovalBinding('-')).toBe(true);
  });

  it('should return true for command with - and spaces', () => {
    expect(isRemovalBinding('- test.command')).toBe(true);
  });
});

describe('getRemovalCommandId', () => {
  it('should strip leading - from command', () => {
    expect(getRemovalCommandId('-test.command')).toBe('test.command');
  });

  it('should handle command with only -', () => {
    expect(getRemovalCommandId('-')).toBe('');
  });

  it('should handle command without -', () => {
    expect(getRemovalCommandId('test.command')).toBe('est.command');
  });

  it('should handle command with multiple -', () => {
    expect(getRemovalCommandId('--test.command')).toBe('-test.command');
  });

  it('should handle empty string', () => {
    expect(getRemovalCommandId('')).toBe('');
  });
});
