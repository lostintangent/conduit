/**
 * Binary Content Detection Utilities
 *
 * Provides heuristic-based detection of binary content in strings.
 * Used by diff and content hooks to avoid displaying binary files in editors.
 *
 * @example
 * ```ts
 * const content = await fetchFileContent(path);
 * if (isBinaryContent(content)) {
 *   return { error: { type: 'binary_file', message: 'Binary file' } };
 * }
 * ```
 */

/**
 * Check if content has a UTF-16 BOM (Byte Order Mark).
 *
 * UTF-16 files legitimately contain null bytes and should not be
 * flagged as binary. This checks for:
 * - UTF-16 LE: 0xFF 0xFE (displays as \uFFFE in JS string)
 * - UTF-16 BE: 0xFE 0xFF (displays as \uFEFF in JS string)
 * - UTF-8 BOM: 0xEF 0xBB 0xBF (displays as \uFEFF after UTF-8 decode)
 */
export function hasUnicodeBOM(content: string): boolean {
  if (content.length === 0) return false;

  const firstChar = content.charCodeAt(0);

  // UTF-8 BOM or UTF-16 BE BOM (both result in 0xFEFF)
  if (firstChar === 0xfeff) return true;

  // UTF-16 LE BOM (0xFF 0xFE, which may appear as 0xFFFE in some contexts)
  if (firstChar === 0xfffe) return true;

  return false;
}

/**
 * Check if content appears to be binary.
 *
 * Uses a heuristic that:
 * 1. First checks for Unicode BOMs - files with BOMs are text
 * 2. Then looks for control characters that indicate binary content
 *
 * We look for:
 * - Null bytes (0x00) - common in binary files
 * - Control chars 0x01-0x08 - not used in text files
 * - Control chars 0x0B (VT) and 0x0C (FF) - rarely used in text
 * - Control chars 0x0E-0x1A - not used in text files
 * - Control chars 0x1C-0x1F - not used in text files
 *
 * We explicitly allow:
 * - Tab (0x09), LF (0x0A), CR (0x0D) - normal text
 * - ESC (0x1B) - ANSI escape codes
 * - DEL (0x7F) - sometimes in text
 *
 * @param content - String content to check
 * @returns true if content appears to be binary
 */
export function isBinaryContent(content: string): boolean {
  // Files with Unicode BOMs are text files
  if (hasUnicodeBOM(content)) {
    return false;
  }

  const checkLength = Math.min(content.length, 8192);

  for (let i = 0; i < checkLength; i++) {
    const charCode = content.charCodeAt(i);

    // Null byte - strong indicator of binary
    if (charCode === 0) {
      return true;
    }

    // Control characters 0x01-0x08 (SOH, STX, ETX, EOT, ENQ, ACK, BEL, BS)
    // These are rarely used in text files
    if (charCode >= 0x01 && charCode <= 0x08) {
      return true;
    }

    // Control characters 0x0B (VT) and 0x0C (FF)
    // We allow 0x09 (TAB), 0x0A (LF), and 0x0D (CR) as they're common in text
    // But VT and FF are rarely used in modern text files
    if (charCode === 0x0b || charCode === 0x0c) {
      return true;
    }

    // Control characters 0x0E-0x1A (SO, SI, DLE, DC1-4, NAK, SYN, ETB, CAN, EM, SUB)
    // Skip 0x1B (ESC) as it's used for ANSI escape codes
    if (charCode >= 0x0e && charCode <= 0x1a) {
      return true;
    }

    // Control characters 0x1C-0x1F (FS, GS, RS, US)
    if (charCode >= 0x1c && charCode <= 0x1f) {
      return true;
    }
  }

  return false;
}
