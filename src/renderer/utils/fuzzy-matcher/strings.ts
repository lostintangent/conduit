/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *  Portions adapted from VS Code: https://github.com/microsoft/vscode
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable no-useless-escape */
/* cspell:disable */
// Note: This file contains functions extracted from VS Code

import { CharCode } from "./charCode";

/**
 * @returns the length of the common prefix of the two strings.
 */
export function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i: number;
  for (i = 0; i < len; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) {
      return i;
    }
  }
  return len;
}

export function startsWithIgnoreCase(str: string, candidate: string): boolean {
  const len = candidate.length;
  return (
    len <= str.length &&
    compareSubstringIgnoreCase(str, candidate, 0, len) === 0
  );
}

export function compareSubstring(
  a: string,
  b: string,
  aStart: number = 0,
  aEnd: number = a.length,
  bStart: number = 0,
  bEnd: number = b.length,
): number {
  for (; aStart < aEnd && bStart < bEnd; aStart++, bStart++) {
    const codeA = a.charCodeAt(aStart);
    const codeB = b.charCodeAt(bStart);
    if (codeA < codeB) {
      return -1;
    } else if (codeA > codeB) {
      return 1;
    }
  }
  const aLen = aEnd - aStart;
  const bLen = bEnd - bStart;
  if (aLen < bLen) {
    return -1;
  } else if (aLen > bLen) {
    return 1;
  }
  return 0;
}

export function compareSubstringIgnoreCase(
  a: string,
  b: string,
  aStart: number = 0,
  aEnd: number = a.length,
  bStart: number = 0,
  bEnd: number = b.length,
): number {
  for (; aStart < aEnd && bStart < bEnd; aStart++, bStart++) {
    let codeA = a.charCodeAt(aStart);
    let codeB = b.charCodeAt(bStart);

    if (codeA === codeB) {
      // equal
      continue;
    }

    if (codeA >= 128 || codeB >= 128) {
      // not ASCII letters -> fallback to lower-casing strings
      return compareSubstring(
        a.toLowerCase(),
        b.toLowerCase(),
        aStart,
        aEnd,
        bStart,
        bEnd,
      );
    }

    // mapper lower-case ascii letter onto upper-case varinats
    // [97-122] (lower ascii) --> [65-90] (upper ascii)
    if (isLowerAsciiLetter(codeA)) {
      codeA -= 32;
    }
    if (isLowerAsciiLetter(codeB)) {
      codeB -= 32;
    }

    // compare both code points
    const diff = codeA - codeB;
    if (diff === 0) {
      continue;
    }

    return diff;
  }

  const aLen = aEnd - aStart;
  const bLen = bEnd - bStart;

  if (aLen < bLen) {
    return -1;
  } else if (aLen > bLen) {
    return 1;
  }

  return 0;
}

export function isLowerAsciiLetter(code: number): boolean {
  return code >= CharCode.a && code <= CharCode.z;
}

export function isUpperAsciiLetter(code: number): boolean {
  return code >= CharCode.A && code <= CharCode.Z;
}

export function convertSimple2RegExpPattern(pattern: string): string {
  return pattern
    .replace(/[\-\\\{\}\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, "\\$&")
    .replace(/[\*]/g, ".*");
}

export function isEmojiImprecise(x: number): boolean {
  return (
    (x >= 0x1f1e6 && x <= 0x1f1ff) ||
    x === 8986 ||
    x === 8987 ||
    x === 9200 ||
    x === 9203 ||
    (x >= 9728 && x <= 10175) ||
    x === 11088 ||
    x === 11093 ||
    (x >= 127744 && x <= 128591) ||
    (x >= 128640 && x <= 128764) ||
    (x >= 128992 && x <= 129008) ||
    (x >= 129280 && x <= 129535) ||
    (x >= 129648 && x <= 129782)
  );
}
