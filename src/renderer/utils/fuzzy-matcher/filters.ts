/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *  Portions adapted from VS Code: https://github.com/microsoft/vscode
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable no-cond-assign */
/* cspell:disable */
// Note: This file is copied from VS Code and contains intentional code patterns

import { CharCode } from "./charCode";
import * as strings from "./strings";

export interface IFilter {
  // Returns null if word doesn't match.
  (word: string, wordToMatchAgainst: string): IMatch[] | null;
}

export interface IMatch {
  start: number;
  end: number;
}
export const matchesPrefix: IFilter = _matchesPrefix.bind(undefined, true);

function _matchesPrefix(
  ignoreCase: boolean,
  word: string,
  wordToMatchAgainst: string,
): IMatch[] | null {
  if (!wordToMatchAgainst || wordToMatchAgainst.length < word.length) {
    return null;
  }

  let matches: boolean;
  if (ignoreCase) {
    matches = strings.startsWithIgnoreCase(wordToMatchAgainst, word);
  } else {
    matches = wordToMatchAgainst.indexOf(word) === 0;
  }

  if (!matches) {
    return null;
  }

  return word.length > 0 ? [{ start: 0, end: word.length }] : [];
}

export function isUpper(code: number): boolean {
  return CharCode.A <= code && code <= CharCode.Z;
}
