/**
 * Unit tests for action override resolution
 */

import { describe, it, expect } from 'vitest';
import { resolveAction } from './resolveAction';
import type { Action } from '../core/types';
import { homedir } from 'os';
import { resolve } from 'path';

describe('resolveAction', () => {
  describe('without overrides', () => {
    it('should return default config when no overrides exist', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'npm test' },
      };

      const result = resolveAction(action, '~/Projects/test');

      expect(result).toEqual({
        paneType: 'terminal',
        config: { command: 'npm test' },
      });
    });

    it('should return default config when overrides array is empty', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'npm test' },
        overrides: [],
      };

      const result = resolveAction(action, '~/Projects/test');

      expect(result).toEqual({
        paneType: 'terminal',
        config: { command: 'npm test' },
      });
    });
  });

  describe('with single override', () => {
    it('should return override config when path matches', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'npm test' },
        overrides: [
          {
            path: '~/Projects',
            config: { command: 'npm run test:watch' },
          },
        ],
      };

      const result = resolveAction(action, '~/Projects/test');

      expect(result).toEqual({
        paneType: 'terminal',
        config: { command: 'npm run test:watch' },
      });
    });

    it('should return default config when path does not match', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'npm test' },
        overrides: [
          {
            path: '~/Projects',
            config: { command: 'npm run test:watch' },
          },
        ],
      };

      const result = resolveAction(action, '~/Work/project');

      expect(result).toEqual({
        paneType: 'terminal',
        config: { command: 'npm test' },
      });
    });

    it('should use override paneType when specified', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'npm test' },
        overrides: [
          {
            path: '~/Projects',
            paneType: 'browser',
            config: { url: 'http://localhost:3000' },
          },
        ],
      };

      const result = resolveAction(action, '~/Projects/test');

      expect(result).toEqual({
        paneType: 'browser',
        config: { url: 'http://localhost:3000' },
      });
    });

    it('should use parent paneType when override does not specify', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'npm test' },
        overrides: [
          {
            path: '~/Projects',
            config: { command: 'npm run test:watch' },
          },
        ],
      };

      const result = resolveAction(action, '~/Projects/test');

      expect(result.paneType).toBe('terminal');
    });
  });

  describe('with multiple overrides', () => {
    it('should return longest matching path override', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'npm test' },
        overrides: [
          {
            path: '~/Projects',
            config: { command: 'npm run test:ci' },
          },
          {
            path: '~/Projects/critical',
            config: { command: 'npm run test:verbose' },
          },
          {
            path: '~/Work',
            config: { command: 'npm run test:work' },
          },
        ],
      };

      const result = resolveAction(action, '~/Projects/critical/src');

      expect(result).toEqual({
        paneType: 'terminal',
        config: { command: 'npm run test:verbose' },
      });
    });

    it('should return default when no override matches', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'npm test' },
        overrides: [
          {
            path: '~/Projects',
            config: { command: 'npm run test:ci' },
          },
          {
            path: '~/Work',
            config: { command: 'npm run test:work' },
          },
        ],
      };

      const result = resolveAction(action, '~/Downloads');

      expect(result).toEqual({
        paneType: 'terminal',
        config: { command: 'npm test' },
      });
    });

    it('should handle deeply nested override paths', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'npm test' },
        overrides: [
          {
            path: '~/Work',
            config: { command: 'step 1' },
          },
          {
            path: '~/Work/critical-project',
            config: { command: 'step 2' },
          },
          {
            path: '~/Work/critical-project/src',
            config: { command: 'step 3' },
          },
          {
            path: '~/Work/critical-project/src/components',
            config: { command: 'step 4' },
          },
        ],
      };

      const result = resolveAction(
        action,
        '~/Work/critical-project/src/components/Button'
      );

      expect(result).toEqual({
        paneType: 'terminal',
        config: { command: 'step 4' },
      });
    });
  });

  describe('path normalization in overrides', () => {
    it('should handle trailing slashes in override paths', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'default' },
        overrides: [
          {
            path: '~/Projects/',
            config: { command: 'override' },
          },
        ],
      };

      const result = resolveAction(action, '~/Projects/test');

      expect(result.config).toEqual({ command: 'override' });
    });

    it('should handle trailing slashes in cwd', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'default' },
        overrides: [
          {
            path: '~/Projects',
            config: { command: 'override' },
          },
        ],
      };

      const result = resolveAction(action, '~/Projects/test/');

      expect(result.config).toEqual({ command: 'override' });
    });

    it('should normalize relative paths in cwd', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: { command: 'default' },
        overrides: [
          {
            path: process.cwd(),
            config: { command: 'override' },
          },
        ],
      };

      const result = resolveAction(action, '.');

      expect(result.config).toEqual({ command: 'override' });
    });
  });

  describe('complete replacement (no merging)', () => {
    it('should completely replace config, not merge', () => {
      const action: Action = {
        name: 'Test Action',
        icon: 'terminal',
        enabled: true,
        paneType: 'terminal',
        config: {
          command: 'npm test',
          env: { NODE_ENV: 'test', LOG_LEVEL: 'debug' },
          clear: true,
        },
        overrides: [
          {
            path: '~/Projects',
            config: { command: 'npm run test:watch' },
          },
        ],
      };

      const result = resolveAction(action, '~/Projects/test');

      // Override config should NOT include env or clear from parent
      expect(result.config).toEqual({ command: 'npm run test:watch' });
      expect(result.config).not.toHaveProperty('env');
      expect(result.config).not.toHaveProperty('clear');
    });
  });

  describe('realistic scenarios', () => {
    it('should handle source control action with work vs home overrides', () => {
      const action: Action = {
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
            path: '~/Work/critical-project',
            config: {
              command: 'git status && git log --oneline -5',
              clear: true,
            },
          },
        ],
      };

      // Home project
      const homeResult = resolveAction(action, '~/Projects/personal');
      expect(homeResult.config).toEqual({ command: 'git status' });

      // Work project
      const workResult = resolveAction(action, '~/Work/normal-project');
      expect(workResult.config).toEqual({ command: 'git status --short' });

      // Critical work project
      const criticalResult = resolveAction(action, '~/Work/critical-project/src');
      expect(criticalResult.config).toEqual({
        command: 'git status && git log --oneline -5',
        clear: true,
      });
    });

    it('should handle action that changes pane type based on location', () => {
      const action: Action = {
        name: 'Documentation',
        icon: 'book',
        enabled: true,
        paneType: 'editor',
        config: { path: './docs' },
        overrides: [
          {
            path: '~/Projects/legacy-app',
            paneType: 'browser',
            config: { url: 'https://legacy-docs.example.com' },
          },
        ],
      };

      // Regular project - open editor
      const regularResult = resolveAction(action, '~/Projects/modern-app');
      expect(regularResult).toEqual({
        paneType: 'editor',
        config: { path: './docs' },
      });

      // Legacy project - open browser
      const legacyResult = resolveAction(action, '~/Projects/legacy-app/src');
      expect(legacyResult).toEqual({
        paneType: 'browser',
        config: { url: 'https://legacy-docs.example.com' },
      });
    });
  });
});
