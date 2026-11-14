import { InvalidArgumentError } from "commander";

// Strict parsers for numeric options, so a malformed value exits with a usage
// error instead of reaching the app as NaN or a silently truncated number.

export function parseInteger(value: string) {
  if (!/^-?\d+$/.test(value)) {
    throw new InvalidArgumentError("Expected an integer.");
  }
  return Number(value);
}

export function parseSeconds(value: string) {
  if (!/^(\d+\.?\d*|\.\d+)$/.test(value)) {
    throw new InvalidArgumentError("Expected a number of seconds.");
  }
  return Number(value);
}
