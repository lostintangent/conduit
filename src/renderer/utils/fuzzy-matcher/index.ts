/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *  Portions adapted from VS Code: https://github.com/microsoft/vscode
 *--------------------------------------------------------------------------------------------*/

// Re-export the key functions needed for Quick Open fuzzy matching
export {
  // Main fuzzy matching functions
  fuzzyScore,
  type FuzzyScore,
  // Match creation and filtering
  createMatches,
  matchesFuzzy,
  matchesFuzzy2,
  // Basic matchers
  matchesPrefix,
  matchesCamelCase,
  matchesContiguousSubString,
  matchesSubString,
  matchesWords,
  // Types
  type IMatch,
  type IFilter,
} from "./filters";

// Re-export character codes if needed
export { CharCode } from "./charCode";

// Re-export string utilities if needed
export {
  startsWithIgnoreCase,
  convertSimple2RegExpPattern,
  isEmojiImprecise,
  commonPrefixLength,
  isLowerAsciiLetter,
  isUpperAsciiLetter,
} from "./strings";
