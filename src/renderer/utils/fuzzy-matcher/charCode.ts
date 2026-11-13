/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* cspell:disable */
// Note: This file is copied from VS Code

// Names from https://blog.codinghorror.com/ascii-pronunciation-rules-for-programmers/

/**
 * An inlined enum containing useful character codes (to be used with String.charCodeAt).
 * Please leave the const keyword such that it gets inlined when compiled to JavaScript!
 */
export const enum CharCode {
  Space = 32,
  /**
   * The `"` character.
   */
  DoubleQuote = 34,
  /**
   * The `'` character.
   */
  SingleQuote = 39,
  /**
   * The `-` character.
   */
  Dash = 45,
  /**
   * The `.` character.
   */
  Period = 46,
  /**
   * The `/` character.
   */
  Slash = 47,

  /**
   * The `:` character.
   */
  Colon = 58,

  A = 65,
  Z = 90,
  /**
   * The `\` character.
   */
  Backslash = 92,
  /**
   * The `_` character.
   */
  Underline = 95,

  a = 97,
  z = 122,
}
