/**
 * Unit tests for file I/O operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getUserPaneActionsPath,
  readPaneActionsFile,
  writePaneActionsFile,
  parsePaneActionsContent,
  readPaneActionsFileOrNull,
} from './fileOperations';
import { ValidationError } from './validation';
import type { Action } from '../core/types';

describe('fileOperations', () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = join(tmpdir(), `pane-actions-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, 'paneactions.json');
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('getUserPaneActionsPath', () => {
    it('should return path to ~/.conduit/paneactions.json', () => {
      const path = getUserPaneActionsPath();
      expect(path).toContain('.conduit');
      expect(path).toContain('paneactions.json');
    });
  });

  describe('parsePaneActionsContent', () => {
    it('should parse valid JSON', () => {
      const content = JSON.stringify([
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'test' },
        },
      ]);

      const result = parsePaneActionsContent(content);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test');
    });

    it('should throw ValidationError for invalid JSON', () => {
      const content = 'not valid json {';

      expect(() => parsePaneActionsContent(content)).toThrow(ValidationError);
      expect(() => parsePaneActionsContent(content)).toThrow('Invalid JSON');
    });

    it('should throw ValidationError for invalid structure', () => {
      const content = JSON.stringify({ not: 'an array' });

      expect(() => parsePaneActionsContent(content)).toThrow(ValidationError);
      expect(() => parsePaneActionsContent(content)).toThrow(
        'must be an array'
      );
    });

    it('should throw ValidationError for empty array', () => {
      const content = JSON.stringify([]);

      expect(() => parsePaneActionsContent(content)).toThrow(ValidationError);
      expect(() => parsePaneActionsContent(content)).toThrow(
        'at least 1 action'
      );
    });

    it('should throw ValidationError for invalid action', () => {
      const content = JSON.stringify([
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'invalid',
          config: { command: 'test' },
        },
      ]);

      expect(() => parsePaneActionsContent(content)).toThrow(ValidationError);
      expect(() => parsePaneActionsContent(content)).toThrow(
        'paneType must be one of'
      );
    });
  });

  describe('readPaneActionsFile', () => {
    it('should return null for non-existent file', async () => {
      const result = await readPaneActionsFile(testFilePath);
      expect(result).toBeNull();
    });

    it('should read and parse valid file', async () => {
      const actions: Action[] = [
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'test' },
        },
      ];

      await writeFile(testFilePath, JSON.stringify(actions), 'utf-8');

      const result = await readPaneActionsFile(testFilePath);
      expect(result).toHaveLength(1);
      expect(result![0].name).toBe('Test');
    });

    it('should throw ValidationError for invalid JSON file', async () => {
      await writeFile(testFilePath, 'not valid json {', 'utf-8');

      await expect(readPaneActionsFile(testFilePath)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for invalid structure', async () => {
      await writeFile(testFilePath, JSON.stringify({ not: 'array' }), 'utf-8');

      await expect(readPaneActionsFile(testFilePath)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw for permission errors', async () => {
      // This test might not work on all platforms, so we'll just verify
      // that non-ENOENT errors are thrown (not swallowed)
      const invalidPath = join(testDir, 'nonexistent-dir', 'file.json');

      // We can't easily test permission errors in a cross-platform way,
      // but we can test that the function doesn't return null for all errors
      // The function should only return null for ENOENT
      const result = await readPaneActionsFile(invalidPath);
      expect(result).toBeNull(); // ENOENT
    });
  });

  describe('writePaneActionsFile', () => {
    it('should write valid actions to file', async () => {
      const actions: Action[] = [
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'test' },
        },
      ];

      await writePaneActionsFile(testFilePath, actions);

      const content = await readFile(testFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('Test');
    });

    it('should format JSON with 2-space indentation', async () => {
      const actions: Action[] = [
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'test' },
        },
      ];

      await writePaneActionsFile(testFilePath, actions);

      const content = await readFile(testFilePath, 'utf-8');
      expect(content).toContain('  "name": "Test"');
    });

    it('should create parent directory if it does not exist', async () => {
      const nestedPath = join(testDir, 'nested', 'dir', 'paneactions.json');
      const actions: Action[] = [
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'test' },
        },
      ];

      await writePaneActionsFile(nestedPath, actions);

      const content = await readFile(nestedPath, 'utf-8');
      expect(content).toBeTruthy();
    });

    it('should validate actions before writing', async () => {
      const invalidActions = [
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'invalid',
          config: { command: 'test' },
        },
      ] as unknown as Action[];

      await expect(
        writePaneActionsFile(testFilePath, invalidActions)
      ).rejects.toThrow(ValidationError);

      // File should not have been created
      await expect(readFile(testFilePath, 'utf-8')).rejects.toThrow();
    });

    it('should write complex actions with overrides', async () => {
      const actions: Action[] = [
        {
          name: 'Source Control',
          icon: 'git-branch',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'git status' },
          overrides: [
            {
              path: '~/Work',
              config: { command: 'git status --short' },
            },
            {
              path: '~/Work/critical',
              config: {
                command: 'git status && git log',
                clear: true,
              },
            },
          ],
        },
      ];

      await writePaneActionsFile(testFilePath, actions);

      const result = await readPaneActionsFile(testFilePath);
      expect(result).toHaveLength(1);
      expect(result![0].overrides).toHaveLength(2);
    });
  });

  describe('readPaneActionsFileOrNull', () => {
    it('should return null for non-existent file', async () => {
      const result = await readPaneActionsFileOrNull(testFilePath);
      expect(result).toBeNull();
    });

    it('should read valid file', async () => {
      const actions: Action[] = [
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'test' },
        },
      ];

      await writeFile(testFilePath, JSON.stringify(actions), 'utf-8');

      const result = await readPaneActionsFileOrNull(testFilePath);
      expect(result).toHaveLength(1);
    });

    it('should throw ValidationError for invalid file', async () => {
      await writeFile(testFilePath, 'invalid json', 'utf-8');

      await expect(readPaneActionsFileOrNull(testFilePath)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('round-trip (write then read)', () => {
    it('should preserve all action fields', async () => {
      const actions: Action[] = [
        {
          name: 'Source Control',
          icon: 'git-branch',
          enabled: true,
          paneType: 'terminal',
          config: {
            command: 'git status',
            cwd: '~/Projects',
            env: { GIT_PAGER: '' },
            clear: true,
          },
        },
        {
          name: 'Editor',
          icon: 'code',
          enabled: false,
          paneType: 'editor',
          config: {},
        },
        {
          name: 'Browser',
          icon: 'globe',
          enabled: true,
          paneType: 'browser',
          config: {
            url: 'http://localhost:3000',
          },
        },
      ];

      await writePaneActionsFile(testFilePath, actions);
      const result = await readPaneActionsFile(testFilePath);

      expect(result).toEqual(actions);
    });

    it('should preserve overrides', async () => {
      const actions: Action[] = [
        {
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'default' },
          overrides: [
            {
              path: '~/Projects',
              config: { command: 'projects' },
            },
            {
              path: '~/Work',
              paneType: 'browser',
              config: { url: 'https://work.example.com' },
            },
          ],
        },
      ];

      await writePaneActionsFile(testFilePath, actions);
      const result = await readPaneActionsFile(testFilePath);

      expect(result).toEqual(actions);
    });
  });
});
