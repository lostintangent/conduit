/**
 * Unit tests for pane actions validation
 */

import { describe, it, expect } from 'vitest';
import { validatePaneActionsConfig, ValidationError } from './validation';

describe('validation', () => {
  describe('validatePaneActionsConfig', () => {
    describe('root validation', () => {
      it('should reject non-array input', () => {
        expect(() => validatePaneActionsConfig({})).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig({})).toThrow(
          'Configuration must be an array of actions'
        );
      });

      it('should reject empty array', () => {
        expect(() => validatePaneActionsConfig([])).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig([])).toThrow(
          'must contain at least 1 action'
        );
      });

      it('should reject array with more than 6 actions', () => {
        const actions = Array(7).fill({
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'test' },
        });

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'at most 6 actions'
        );
      });

      it('should accept array with 1 action', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).not.toThrow();
      });

      it('should accept array with 6 actions', () => {
        const actions = Array(6).fill({
          name: 'Test',
          icon: 'test',
          enabled: true,
          paneType: 'terminal',
          config: { command: 'test' },
        });

        expect(() => validatePaneActionsConfig(actions)).not.toThrow();
      });
    });

    describe('action validation', () => {
      it('should reject non-object action', () => {
        expect(() => validatePaneActionsConfig(['not an object'])).toThrow(
          ValidationError
        );
        expect(() => validatePaneActionsConfig(['not an object'])).toThrow(
          'Action must be an object'
        );
      });

      it('should reject missing name', () => {
        const actions = [
          {
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'name must be a string'
        );
      });

      it('should reject empty name', () => {
        const actions = [
          {
            name: '   ',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'name cannot be empty'
        );
      });

      it('should reject missing icon', () => {
        const actions = [
          {
            name: 'Test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'icon must be a string'
        );
      });

      it('should reject empty icon', () => {
        const actions = [
          {
            name: 'Test',
            icon: '',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'icon cannot be empty'
        );
      });

      it('should reject missing enabled', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            paneType: 'terminal',
            config: { command: 'test' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'enabled must be a boolean'
        );
      });

      it('should reject invalid paneType', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'invalid',
            config: { command: 'test' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'paneType must be one of: terminal, editor, browser'
        );
      });

      it('should reject missing config', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'config must be an object'
        );
      });
    });

    describe('terminal config validation', () => {
      it('should accept valid terminal config', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'npm test' },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result).toHaveLength(1);
        expect(result[0].config).toEqual({ command: 'npm test' });
      });

      it('should reject missing command', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: {},
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'command must be a string'
        );
      });

      it('should accept empty command', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: '' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).not.toThrow();
      });

      it('should accept all optional terminal fields', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: {
              command: 'npm test',
              cwd: '~/Projects',
              env: { NODE_ENV: 'test' },
              clear: true,
            },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({
          command: 'npm test',
          cwd: '~/Projects',
          env: { NODE_ENV: 'test' },
          clear: true,
        });
      });

      it('should reject invalid cwd type', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test', cwd: 123 },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'cwd must be a string'
        );
      });

      it('should reject invalid env type', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test', env: 'not an object' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'env must be an object'
        );
      });

      it('should reject non-string env values', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test', env: { KEY: 123 } },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'env.KEY must be a string'
        );
      });

      it('should reject invalid clear type', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test', clear: 'yes' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'clear must be a boolean'
        );
      });
    });

    describe('editor config validation', () => {
      it('should accept empty editor config', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'editor',
            config: {},
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({});
      });

      it('should accept all optional editor fields', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'editor',
            config: {
              path: '~/Projects',
              filePattern: '*.ts',
              revealInTree: true,
              lineNumber: 42,
            },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({
          path: '~/Projects',
          filePattern: '*.ts',
          revealInTree: true,
          lineNumber: 42,
        });
      });

      it('should reject invalid path type', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'editor',
            config: { path: 123 },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'path must be a string'
        );
      });

      it('should reject invalid filePattern type', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'editor',
            config: { filePattern: 123 },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'filePattern must be a string'
        );
      });

      it('should reject invalid revealInTree type', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'editor',
            config: { revealInTree: 'yes' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'revealInTree must be a boolean'
        );
      });

      it('should reject non-integer lineNumber', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'editor',
            config: { lineNumber: 3.14 },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'lineNumber must be a positive integer'
        );
      });

      it('should reject zero lineNumber', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'editor',
            config: { lineNumber: 0 },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'lineNumber must be a positive integer'
        );
      });

      it('should reject negative lineNumber', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'editor',
            config: { lineNumber: -1 },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'lineNumber must be a positive integer'
        );
      });
    });

    describe('browser config validation', () => {
      it('should accept valid browser config', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'browser',
            config: { url: 'https://example.com' },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({ url: 'https://example.com' });
      });

      it('should reject missing url', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'browser',
            config: {},
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'url must be a string'
        );
      });

      it('should reject empty url', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'browser',
            config: { url: '   ' },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'url cannot be empty'
        );
      });
    });

    describe('override validation', () => {
      it('should accept valid override', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'default' },
            overrides: [
              {
                path: '~/Projects',
                config: { command: 'override' },
              },
            ],
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].overrides).toHaveLength(1);
        expect(result[0].overrides![0]).toEqual({
          path: '~/Projects',
          config: { command: 'override' },
        });
      });

      it('should accept override with paneType change', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'default' },
            overrides: [
              {
                path: '~/Projects',
                paneType: 'browser',
                config: { url: 'https://example.com' },
              },
            ],
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].overrides![0]).toEqual({
          path: '~/Projects',
          paneType: 'browser',
          config: { url: 'https://example.com' },
        });
      });

      it('should reject non-array overrides', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'test' },
            overrides: 'not an array',
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'overrides must be an array'
        );
      });

      it('should reject override with missing path', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'default' },
            overrides: [
              {
                config: { command: 'override' },
              },
            ],
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'path must be a string'
        );
      });

      it('should reject override with empty path', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'default' },
            overrides: [
              {
                path: '',
                config: { command: 'override' },
              },
            ],
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'path cannot be empty'
        );
      });

      it('should reject override with invalid paneType', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'default' },
            overrides: [
              {
                path: '~/Projects',
                paneType: 'invalid',
                config: { command: 'override' },
              },
            ],
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'paneType must be one of: terminal, editor, browser'
        );
      });

      it('should validate override config matches override paneType', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'default' },
            overrides: [
              {
                path: '~/Projects',
                paneType: 'browser',
                config: { command: 'wrong config type' },
              },
            ],
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'url must be a string'
        );
      });

      it('should validate override config matches parent paneType when not overridden', () => {
        const actions = [
          {
            name: 'Test',
            icon: 'test',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'default' },
            overrides: [
              {
                path: '~/Projects',
                config: { url: 'https://example.com' }, // Wrong type for terminal
              },
            ],
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          'command must be a string'
        );
      });
    });

    describe('complete valid examples', () => {
      it('should validate default actions', () => {
        const actions = [
          {
            name: 'Source Control',
            icon: 'git-branch',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'git status' },
          },
          {
            name: 'Editor',
            icon: 'code',
            enabled: true,
            paneType: 'editor',
            config: {},
          },
          {
            name: 'Agent',
            icon: 'bot',
            enabled: true,
            paneType: 'terminal',
            config: { command: 'claude-code' },
          },
          {
            name: 'Browser',
            icon: 'globe',
            enabled: false,
            paneType: 'browser',
            config: { url: 'https://github.com' },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result).toHaveLength(4);
      });

      it('should validate complex action with overrides', () => {
        const actions = [
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
                path: '~/Work/critical-project',
                config: {
                  command: 'git status && git log --oneline -5',
                  clear: true,
                },
              },
            ],
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result).toHaveLength(1);
        expect(result[0].overrides).toHaveLength(2);
      });
    });
  });
});
