/**
 * Port detection utilities for parsing terminal output
 */

/**
 * Regex patterns to detect port numbers in terminal output
 * Matches common development server messages and localhost references
 */
const PORT_PATTERNS = [
  // Common dev server messages
  /Server (?:running|started|listening) (?:at|on) .*?:(\d+)/i,
  /Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i,
  /Network:\s+https?:\/\/.*?:(\d+)/i,

  // Framework-specific patterns
  /ready - started server on .*?:(\d+)/i, // Next.js
  /Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i, // Vite
  /App running at:.*?localhost:(\d+)/i, // Vue CLI
  /Listening on .*?:(\d+)/i, // Express/generic
  /started on port[:\s]+(\d+)/i, // Generic

  // Direct localhost/127.0.0.1 references
  /(?:localhost|127\.0\.0\.1):(\d+)/gi,

  // Generic "port XXXX" or "port: XXXX"
  /(?:^|\s)port[:\s]+(\d+)/i,
];

/**
 * Extract unique port numbers from terminal output
 * Only returns ports in the valid range (1024-65535) to avoid false positives
 */
export function detectPorts(output: string): number[] {
  const ports = new Set<number>();

  for (const pattern of PORT_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;

    let match;
    if (pattern.global) {
      while ((match = pattern.exec(output)) !== null) {
        const port = parseInt(match[1], 10);
        if (isValidPort(port)) {
          ports.add(port);
        }
      }
    } else {
      match = pattern.exec(output);
      if (match) {
        const port = parseInt(match[1], 10);
        if (isValidPort(port)) {
          ports.add(port);
        }
      }
    }
  }

  return Array.from(ports);
}

/**
 * Check if a port number is in the valid range for user applications
 * Excludes system ports (0-1023) to reduce false positives
 */
function isValidPort(port: number): boolean {
  return !isNaN(port) && port >= 1024 && port <= 65535;
}

/**
 * Create a regex pattern to match port numbers in terminal output
 * This can be used with xterm.js link matcher
 */
export function createPortLinkPattern(): RegExp {
  // Match localhost:XXXX or 127.0.0.1:XXXX
  return /(?:localhost|127\.0\.0\.1):(\d+)/gi;
}

/**
 * Extract port number from a matched string
 */
export function extractPortFromMatch(match: string): number | null {
  const portMatch = match.match(/:(\d+)$/);
  if (!portMatch) return null;

  const port = parseInt(portMatch[1], 10);
  return isValidPort(port) ? port : null;
}
