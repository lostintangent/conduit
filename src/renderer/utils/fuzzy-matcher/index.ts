/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *  Portions adapted from VS Code: https://github.com/microsoft/vscode
 *--------------------------------------------------------------------------------------------*/

// Re-export the key functions needed for Quick Open fuzzy matching

export type { IMatch } from "./filters";

export {
  prepareQuery,
  scoreItemFuzzy,
  compareItemsByFuzzyScore,
  type IItemAccessor,
  type FuzzyScorerCache,
} from "./scorer";
