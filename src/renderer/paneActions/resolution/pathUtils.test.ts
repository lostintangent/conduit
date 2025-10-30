/**
 * Unit tests for path normalization and matching utilities
 */

import { describe, it, expect } from 'vitest';
import { normalizePath, isPrefixOf, findLongestMatch } from './pathUtils';
import { homedir } from 'os';
import { resolve } from 'path';

describe('pathUtils', () => {
  describe('normalizePath', () => {
    it('should expand ~ to home directory', () => {
      const result = normalizePath('~/Projects');
      const expected = resolve(homedir(), 'Projects');
      expect(result).toBe(expected);
    });

    it('should expand ~/ to home directory', () => {
      const result = normalizePath('~/Projects/test');
      const expected = resolve(homedir(), 'Projects/test');
      expect(result).toBe(expected);
    });

    it('should resolve relative paths to absolute', () => {
      const result = normalizePath('./src');
      const expected = resolve(process.cwd(), 'src');
      expect(result).toBe(expected);
    });

    it('should remove trailing slashes', () => {
      const result = normalizePath('~/Projects/');
      const expected = resolve(homedir(), 'Projects');
      expect(result).toBe(expected);
    });

    it('should keep root / without trailing slash removal', () => {
      const result = normalizePath('/');
      expect(result).toBe('/');
    });

    it('should handle multiple trailing slashes', () => {
      const result = normalizePath('~/Projects///');
      const expected = resolve(homedir(), 'Projects');
      expect(result).toBe(expected);
    });

    it('should handle already absolute paths', () => {
      const result = normalizePath('/usr/local/bin');
      expect(result).toBe('/usr/local/bin');
    });

    it('should handle paths with .. (parent directory)', () => {
      const result = normalizePath('~/Projects/../Work');
      const expected = resolve(homedir(), 'Work');
      expect(result).toBe(expected);
    });

    it('should handle paths with . (current directory)', () => {
      const result = normalizePath('~/Projects/./test');
      const expected = resolve(homedir(), 'Projects/test');
      expect(result).toBe(expected);
    });
  });

  describe('isPrefixOf', () => {
    it('should return true for exact match', () => {
      const target = '/Users/alice/Projects';
      const candidate = '/Users/alice/Projects';
      expect(isPrefixOf(target, candidate)).toBe(true);
    });

    it('should return true for valid prefix at directory boundary', () => {
      const target = '/Users/alice/Projects/test';
      const candidate = '/Users/alice/Projects';
      expect(isPrefixOf(target, candidate)).toBe(true);
    });

    it('should return false for partial directory name match', () => {
      const target = '/Users/alice/ProjectsOld';
      const candidate = '/Users/alice/Projects';
      expect(isPrefixOf(target, candidate)).toBe(false);
    });

    it('should return false for non-matching paths', () => {
      const target = '/Users/alice/Work';
      const candidate = '/Users/bob/Projects';
      expect(isPrefixOf(target, candidate)).toBe(false);
    });

    it('should return true for nested paths', () => {
      const target = '/Users/alice/Projects/test/src/components';
      const candidate = '/Users/alice/Projects';
      expect(isPrefixOf(target, candidate)).toBe(true);
    });

    it('should return true for immediate child directory', () => {
      const target = '/Users/alice/Projects/test';
      const candidate = '/Users/alice/Projects';
      expect(isPrefixOf(target, candidate)).toBe(true);
    });

    it('should return false when candidate is longer than target', () => {
      const target = '/Users/alice';
      const candidate = '/Users/alice/Projects';
      expect(isPrefixOf(target, candidate)).toBe(false);
    });

    it('should handle root directory as candidate', () => {
      const target = '/Users/alice/Projects';
      const candidate = '/';
      expect(isPrefixOf(target, candidate)).toBe(true);
    });

    it('should handle similar path prefixes correctly', () => {
      // "~/Work/api" should not match "~/Work/api-v2"
      const target = '/Users/alice/Work/api-v2';
      const candidate = '/Users/alice/Work/api';
      expect(isPrefixOf(target, candidate)).toBe(false);
    });
  });

  describe('findLongestMatch', () => {
    it('should return -1 when no paths match', () => {
      const target = '/Users/alice/Downloads';
      const candidates = ['/Users/alice/Projects', '/Users/alice/Work'];
      expect(findLongestMatch(target, candidates)).toBe(-1);
    });

    it('should return index of single matching path', () => {
      const target = '/Users/alice/Projects/test';
      const candidates = ['/Users/alice/Projects'];
      expect(findLongestMatch(target, candidates)).toBe(0);
    });

    it('should return index of longest match when multiple paths match', () => {
      const target = '/Users/alice/Projects/test/src';
      const candidates = [
        '/Users/alice/Projects',
        '/Users/alice/Projects/test',
        '/Users/alice',
      ];
      // Index 1 ("/Users/alice/Projects/test") is longest
      expect(findLongestMatch(target, candidates)).toBe(1);
    });

    it('should return first index when multiple paths have same length', () => {
      const target = '/Users/alice/Projects/test';
      const candidates = [
        '/Users/alice/Projects',
        '/Users/alice/Work', // Different path, same length
        '/Users/alice/Projects', // Duplicate
      ];
      expect(findLongestMatch(target, candidates)).toBe(0);
    });

    it('should handle exact match in candidates', () => {
      const target = '/Users/alice/Projects/test';
      const candidates = [
        '/Users/alice/Projects',
        '/Users/alice/Projects/test',
        '/Users/alice',
      ];
      // Index 1 is exact match and longest
      expect(findLongestMatch(target, candidates)).toBe(1);
    });

    it('should return -1 for empty candidates array', () => {
      const target = '/Users/alice/Projects';
      const candidates: string[] = [];
      expect(findLongestMatch(target, candidates)).toBe(-1);
    });

    it('should handle deeply nested paths', () => {
      const target = '/Users/alice/Work/critical-project/src/components/Button';
      const candidates = [
        '/Users/alice/Work',
        '/Users/alice/Work/critical-project',
        '/Users/alice/Work/critical-project/src',
      ];
      // Index 2 is longest match
      expect(findLongestMatch(target, candidates)).toBe(2);
    });

    it('should prioritize longer matches over earlier positions', () => {
      const target = '/Users/alice/Projects/api-v2/routes';
      const candidates = [
        '/Users/alice/Projects', // Earlier but shorter
        '/Users/alice', // Even earlier but even shorter
        '/Users/alice/Projects/api-v2', // Later but longest
      ];
      // Index 2 should win due to length
      expect(findLongestMatch(target, candidates)).toBe(2);
    });
  });

  describe('integration scenarios (from schema examples)', () => {
    it('should match schema example: ~/Projects/test/src matches ~/Projects', () => {
      const target = normalizePath('~/Projects/test/src');
      const candidate = normalizePath('~/Projects');
      expect(isPrefixOf(target, candidate)).toBe(true);
    });

    it('should match schema example: ~/Projects/test/src matches ~/Projects/test (longer)', () => {
      const target = normalizePath('~/Projects/test/src');
      const candidate = normalizePath('~/Projects/test');
      expect(isPrefixOf(target, candidate)).toBe(true);
    });

    it('should not match schema example: ~/Projects/test/src vs ~/Projects/testing', () => {
      const target = normalizePath('~/Projects/test/src');
      const candidate = normalizePath('~/Projects/testing');
      expect(isPrefixOf(target, candidate)).toBe(false);
    });

    it('should match schema example: ~/Work/api-v2/routes matches ~/Work', () => {
      const target = normalizePath('~/Work/api-v2/routes');
      const candidate = normalizePath('~/Work');
      expect(isPrefixOf(target, candidate)).toBe(true);
    });

    it('should match schema example: ~/Work/api-v2/routes matches ~/Work/api-v2', () => {
      const target = normalizePath('~/Work/api-v2/routes');
      const candidate = normalizePath('~/Work/api-v2');
      expect(isPrefixOf(target, candidate)).toBe(true);
    });

    it('should not match schema example: ~/Work/api-v2/routes vs ~/Work/api', () => {
      const target = normalizePath('~/Work/api-v2/routes');
      const candidate = normalizePath('~/Work/api');
      expect(isPrefixOf(target, candidate)).toBe(false);
    });

    it('should not match schema example: ~/Downloads vs ~/Projects', () => {
      const target = normalizePath('~/Downloads');
      const candidate = normalizePath('~/Projects');
      expect(isPrefixOf(target, candidate)).toBe(false);
    });

    it('should select longest match in realistic override scenario', () => {
      const cwd = normalizePath('~/Work/critical-project/src');
      const overridePaths = [
        normalizePath('~/Work'),
        normalizePath('~/Work/critical-project'),
        normalizePath('~/Work/critical-project/src'),
      ];

      const matchIndex = findLongestMatch(cwd, overridePaths);
      expect(matchIndex).toBe(2); // Most specific: ~/Work/critical-project/src
    });
  });
});
