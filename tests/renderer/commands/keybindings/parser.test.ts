/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import {
  parseKeybinding,
  parseChord,
  matchesEvent,
  normalizeKey,
  formatChord,
  formatKeybinding
} from '@/commands/keybindings/parser';

describe('parseChord()', () => {
  it('should parse single key', () => {
    const chord = parseChord('t');
    expect(chord).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      key: 't'
    });
  });

  it('should parse Ctrl modifier', () => {
    const chord = parseChord('Ctrl+T');
    expect(chord).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
      key: 't'
    });
  });

  it('should parse Shift modifier', () => {
    const chord = parseChord('Shift+T');
    expect(chord).toEqual({
      ctrl: false,
      shift: true,
      alt: false,
      meta: false,
      key: 't'
    });
  });

  it('should parse Alt modifier', () => {
    const chord = parseChord('Alt+T');
    expect(chord).toEqual({
      ctrl: false,
      shift: false,
      alt: true,
      meta: false,
      key: 't'
    });
  });

  it('should parse Cmd modifier', () => {
    const chord = parseChord('Cmd+T');
    expect(chord).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: true,
      key: 't'
    });
  });

  it('should parse Meta modifier', () => {
    const chord = parseChord('Meta+T');
    expect(chord).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: true,
      key: 't'
    });
  });

  it('should parse Win modifier', () => {
    const chord = parseChord('Win+T');
    expect(chord).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: true,
      key: 't'
    });
  });

  it('should parse multiple modifiers', () => {
    const chord = parseChord('Ctrl+Shift+Alt+T');
    expect(chord).toEqual({
      ctrl: true,
      shift: true,
      alt: true,
      meta: false,
      key: 't'
    });
  });

  it('should parse Cmd+Shift combination', () => {
    const chord = parseChord('Cmd+Shift+P');
    expect(chord).toEqual({
      ctrl: false,
      shift: true,
      alt: false,
      meta: true,
      key: 'p'
    });
  });

  it('should be case insensitive', () => {
    const chord = parseChord('ctrl+SHIFT+t');
    expect(chord).toEqual({
      ctrl: true,
      shift: true,
      alt: false,
      meta: false,
      key: 't'
    });
  });
});

describe('parseKeybinding()', () => {
  it('should parse single chord', () => {
    const chords = parseKeybinding('Ctrl+T');
    expect(chords).toHaveLength(1);
    expect(chords[0]).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
      key: 't'
    });
  });

  it('should parse multiple chords', () => {
    const chords = parseKeybinding('Cmd+K Cmd+W');
    expect(chords).toHaveLength(2);
    expect(chords[0]).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: true,
      key: 'k'
    });
    expect(chords[1]).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: true,
      key: 'w'
    });
  });

  it('should handle extra whitespace', () => {
    const chords = parseKeybinding('  Cmd+K   Cmd+W  ');
    expect(chords).toHaveLength(2);
  });
});

describe('matchesEvent()', () => {
  it('should match simple key', () => {
    const chord = { ctrl: false, shift: false, alt: false, meta: false, key: 't' };
    const event = new KeyboardEvent('keydown', {
      key: 't',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false
    });
    expect(matchesEvent(chord, event)).toBe(true);
  });

  it('should match with Ctrl', () => {
    const chord = { ctrl: true, shift: false, alt: false, meta: false, key: 't' };
    const event = new KeyboardEvent('keydown', {
      key: 't',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false
    });
    expect(matchesEvent(chord, event)).toBe(true);
  });

  it('should not match when modifiers differ', () => {
    const chord = { ctrl: true, shift: false, alt: false, meta: false, key: 't' };
    const event = new KeyboardEvent('keydown', {
      key: 't',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false
    });
    expect(matchesEvent(chord, event)).toBe(false);
  });

  it('should not match when key differs', () => {
    const chord = { ctrl: true, shift: false, alt: false, meta: false, key: 't' };
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false
    });
    expect(matchesEvent(chord, event)).toBe(false);
  });

  it('should match with all modifiers', () => {
    const chord = { ctrl: true, shift: true, alt: true, meta: true, key: 't' };
    const event = new KeyboardEvent('keydown', {
      key: 't',
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
      metaKey: true
    });
    expect(matchesEvent(chord, event)).toBe(true);
  });
});

describe('normalizeKey()', () => {
  it('should normalize escape', () => {
    expect(normalizeKey('escape')).toBe('Escape');
    expect(normalizeKey('esc')).toBe('Escape');
  });

  it('should normalize enter', () => {
    expect(normalizeKey('enter')).toBe('Enter');
    expect(normalizeKey('return')).toBe('Enter');
  });

  it('should normalize delete', () => {
    expect(normalizeKey('delete')).toBe('Delete');
    expect(normalizeKey('del')).toBe('Delete');
  });

  it('should normalize arrow keys', () => {
    expect(normalizeKey('arrowup')).toBe('ArrowUp');
    expect(normalizeKey('up')).toBe('ArrowUp');
    expect(normalizeKey('arrowdown')).toBe('ArrowDown');
    expect(normalizeKey('down')).toBe('ArrowDown');
    expect(normalizeKey('arrowleft')).toBe('ArrowLeft');
    expect(normalizeKey('left')).toBe('ArrowLeft');
    expect(normalizeKey('arrowright')).toBe('ArrowRight');
    expect(normalizeKey('right')).toBe('ArrowRight');
  });

  it('should normalize space', () => {
    expect(normalizeKey('space')).toBe(' ');
  });

  it('should normalize tab', () => {
    expect(normalizeKey('tab')).toBe('Tab');
  });

  it('should normalize backspace', () => {
    expect(normalizeKey('backspace')).toBe('Backspace');
  });

  it('should lowercase unknown keys', () => {
    expect(normalizeKey('A')).toBe('a');
    expect(normalizeKey('T')).toBe('t');
  });
});

describe('formatChord()', () => {
  it('should format simple key', () => {
    const chord = { ctrl: false, shift: false, alt: false, meta: false, key: 't' };
    expect(formatChord(chord)).toBe('T');
  });

  it('should format with Ctrl', () => {
    const chord = { ctrl: true, shift: false, alt: false, meta: false, key: 't' };
    expect(formatChord(chord)).toBe('Ctrl+T');
  });

  it('should format with Shift', () => {
    const chord = { ctrl: false, shift: true, alt: false, meta: false, key: 't' };
    expect(formatChord(chord)).toBe('Shift+T');
  });

  it('should format with Alt', () => {
    const chord = { ctrl: false, shift: false, alt: true, meta: false, key: 't' };
    expect(formatChord(chord)).toBe('Alt+T');
  });

  it('should format with Cmd', () => {
    const chord = { ctrl: false, shift: false, alt: false, meta: true, key: 't' };
    expect(formatChord(chord)).toBe('Cmd+T');
  });

  it('should format with multiple modifiers', () => {
    const chord = { ctrl: true, shift: true, alt: true, meta: false, key: 't' };
    expect(formatChord(chord)).toBe('Ctrl+Alt+Shift+T');
  });

  it('should format Cmd+Shift+P', () => {
    const chord = { ctrl: false, shift: true, alt: false, meta: true, key: 'p' };
    expect(formatChord(chord)).toBe('Shift+Cmd+P');
  });
});

describe('formatKeybinding()', () => {
  it('should format single chord', () => {
    const chords = [{ ctrl: true, shift: false, alt: false, meta: false, key: 't' }];
    expect(formatKeybinding(chords)).toBe('Ctrl+T');
  });

  it('should format multiple chords', () => {
    const chords = [
      { ctrl: false, shift: false, alt: false, meta: true, key: 'k' },
      { ctrl: false, shift: false, alt: false, meta: true, key: 'w' }
    ];
    expect(formatKeybinding(chords)).toBe('Cmd+K Cmd+W');
  });
});
