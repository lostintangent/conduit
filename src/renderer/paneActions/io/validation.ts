/**
 * Pane Actions Configuration Validation
 *
 * Validates pane actions configurations against the schema.
 * Based on: docs/pane-actions-schema.md
 */

import type {
  Action,
  PaneType,
  PaneConfig,
  TerminalConfig,
  EditorConfig,
  BrowserConfig,
  ActionOverride,
} from '../core/types';

/**
 * Validation error with context
 */
export class ValidationError extends Error {
  constructor(message: string, context?: string) {
    super(context ? `${context}: ${message}` : message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate the entire pane actions configuration
 *
 * @param data - Raw data to validate
 * @returns Validated actions array
 * @throws ValidationError if validation fails
 */
export function validatePaneActionsConfig(data: unknown): Action[] {
  // Must be an array
  if (!Array.isArray(data)) {
    throw new ValidationError(
      'Configuration must be an array of actions',
      'Root validation'
    );
  }

  // Must have 1-6 actions
  if (data.length === 0) {
    throw new ValidationError(
      'Configuration must contain at least 1 action',
      'Array length validation'
    );
  }

  if (data.length > 6) {
    throw new ValidationError(
      `Configuration can contain at most 6 actions, found ${data.length}`,
      'Array length validation'
    );
  }

  // Validate each action
  const validatedActions: Action[] = [];
  for (let i = 0; i < data.length; i++) {
    const action = validateAction(data[i], i);
    validatedActions.push(action);
  }

  return validatedActions;
}

/**
 * Validate a single action
 *
 * @param data - Raw action data
 * @param index - Action index (for error context)
 * @returns Validated action
 * @throws ValidationError if validation fails
 */
export function validateAction(data: unknown, index: number): Action {
  const context = `Action[${index}]`;

  if (!isObject(data)) {
    throw new ValidationError('Action must be an object', context);
  }

  // Validate name (required, non-empty string)
  if (typeof data.name !== 'string') {
    throw new ValidationError('name must be a string', context);
  }
  if (data.name.trim() === '') {
    throw new ValidationError('name cannot be empty', context);
  }

  // Validate icon (required, non-empty string)
  if (typeof data.icon !== 'string') {
    throw new ValidationError('icon must be a string', context);
  }
  if (data.icon.trim() === '') {
    throw new ValidationError('icon cannot be empty', context);
  }

  // Validate enabled (required, boolean)
  if (typeof data.enabled !== 'boolean') {
    throw new ValidationError('enabled must be a boolean', context);
  }

  // Validate paneType (required, valid enum value)
  if (typeof data.paneType !== 'string') {
    throw new ValidationError('paneType must be a string', context);
  }
  if (!isValidPaneType(data.paneType)) {
    throw new ValidationError(
      `paneType must be one of: terminal, editor, browser. Got: "${data.paneType}"`,
      context
    );
  }

  // Validate config (required, matches paneType)
  if (!isObject(data.config)) {
    throw new ValidationError('config must be an object', context);
  }
  const validatedConfig = validatePaneConfig(
    data.paneType as PaneType,
    data.config,
    context
  );

  // Validate overrides (optional, array)
  let validatedOverrides: ActionOverride[] | undefined;
  if (data.overrides !== undefined) {
    if (!Array.isArray(data.overrides)) {
      throw new ValidationError('overrides must be an array', context);
    }
    validatedOverrides = data.overrides.map((override, i) =>
      validateOverride(override, data.paneType as PaneType, i, context)
    );
  }

  return {
    name: data.name,
    icon: data.icon,
    enabled: data.enabled,
    paneType: data.paneType as PaneType,
    config: validatedConfig,
    overrides: validatedOverrides,
  };
}

/**
 * Validate pane type-specific configuration
 *
 * @param paneType - The pane type
 * @param data - Raw config data
 * @param context - Error context
 * @returns Validated config
 * @throws ValidationError if validation fails
 */
export function validatePaneConfig(
  paneType: PaneType,
  data: unknown,
  context: string
): PaneConfig {
  if (!isObject(data)) {
    throw new ValidationError('config must be an object', context);
  }

  switch (paneType) {
    case 'terminal':
      return validateTerminalConfig(data, context);
    case 'editor':
      return validateEditorConfig(data, context);
    case 'browser':
      return validateBrowserConfig(data, context);
    default:
      throw new ValidationError(
        `Unknown paneType: ${paneType}`,
        context
      );
  }
}

/**
 * Validate terminal configuration
 */
function validateTerminalConfig(
  data: Record<string, unknown>,
  context: string
): TerminalConfig {
  const configContext = `${context}.config`;

  // command is required
  if (typeof data.command !== 'string') {
    throw new ValidationError(
      'terminal config: command must be a string',
      configContext
    );
  }

  // cwd is optional string
  if (data.cwd !== undefined && typeof data.cwd !== 'string') {
    throw new ValidationError(
      'terminal config: cwd must be a string',
      configContext
    );
  }

  // env is optional object with string values
  if (data.env !== undefined) {
    if (!isObject(data.env)) {
      throw new ValidationError(
        'terminal config: env must be an object',
        configContext
      );
    }
    for (const [key, value] of Object.entries(data.env)) {
      if (typeof value !== 'string') {
        throw new ValidationError(
          `terminal config: env.${key} must be a string`,
          configContext
        );
      }
    }
  }

  // clear is optional boolean
  if (data.clear !== undefined && typeof data.clear !== 'boolean') {
    throw new ValidationError(
      'terminal config: clear must be a boolean',
      configContext
    );
  }

  const config: TerminalConfig = {
    command: data.command,
  };

  if (data.cwd !== undefined) config.cwd = data.cwd;
  if (data.env !== undefined) config.env = data.env as Record<string, string>;
  if (data.clear !== undefined) config.clear = data.clear;

  return config;
}

/**
 * Validate editor configuration
 */
function validateEditorConfig(
  data: Record<string, unknown>,
  context: string
): EditorConfig {
  const configContext = `${context}.config`;

  // All fields are optional for editor config
  const config: EditorConfig = {};

  if (data.path !== undefined) {
    if (typeof data.path !== 'string') {
      throw new ValidationError(
        'editor config: path must be a string',
        configContext
      );
    }
    config.path = data.path;
  }

  if (data.filePattern !== undefined) {
    if (typeof data.filePattern !== 'string') {
      throw new ValidationError(
        'editor config: filePattern must be a string',
        configContext
      );
    }
    config.filePattern = data.filePattern;
  }

  if (data.revealInTree !== undefined) {
    if (typeof data.revealInTree !== 'boolean') {
      throw new ValidationError(
        'editor config: revealInTree must be a boolean',
        configContext
      );
    }
    config.revealInTree = data.revealInTree;
  }

  if (data.lineNumber !== undefined) {
    if (typeof data.lineNumber !== 'number') {
      throw new ValidationError(
        'editor config: lineNumber must be a number',
        configContext
      );
    }
    if (!Number.isInteger(data.lineNumber) || data.lineNumber < 1) {
      throw new ValidationError(
        'editor config: lineNumber must be a positive integer',
        configContext
      );
    }
    config.lineNumber = data.lineNumber;
  }

  return config;
}

/**
 * Validate browser configuration
 */
function validateBrowserConfig(
  data: Record<string, unknown>,
  context: string
): BrowserConfig {
  const configContext = `${context}.config`;

  // url is required
  if (typeof data.url !== 'string') {
    throw new ValidationError(
      'browser config: url must be a string',
      configContext
    );
  }

  if (data.url.trim() === '') {
    throw new ValidationError(
      'browser config: url cannot be empty',
      configContext
    );
  }

  return {
    url: data.url,
  };
}

/**
 * Validate an action override
 */
function validateOverride(
  data: unknown,
  parentPaneType: PaneType,
  index: number,
  parentContext: string
): ActionOverride {
  const context = `${parentContext}.overrides[${index}]`;

  if (!isObject(data)) {
    throw new ValidationError('Override must be an object', context);
  }

  // path is required
  if (typeof data.path !== 'string') {
    throw new ValidationError('override: path must be a string', context);
  }
  if (data.path.trim() === '') {
    throw new ValidationError('override: path cannot be empty', context);
  }

  // paneType is optional
  let paneType: PaneType | undefined;
  if (data.paneType !== undefined) {
    if (typeof data.paneType !== 'string') {
      throw new ValidationError(
        'override: paneType must be a string',
        context
      );
    }
    if (!isValidPaneType(data.paneType)) {
      throw new ValidationError(
        `override: paneType must be one of: terminal, editor, browser. Got: "${data.paneType}"`,
        context
      );
    }
    paneType = data.paneType as PaneType;
  }

  // config is required
  if (!isObject(data.config)) {
    throw new ValidationError('override: config must be an object', context);
  }

  // Validate config matches paneType (override or parent)
  const effectivePaneType = paneType ?? parentPaneType;
  const validatedConfig = validatePaneConfig(
    effectivePaneType,
    data.config,
    context
  );

  const override: ActionOverride = {
    path: data.path,
    config: validatedConfig,
  };

  if (paneType !== undefined) {
    override.paneType = paneType;
  }

  return override;
}

/**
 * Type guard for valid pane types
 */
function isValidPaneType(value: string): value is PaneType {
  return value === 'terminal' || value === 'editor' || value === 'browser';
}

/**
 * Type guard for objects
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
