import { InvalidArgumentError } from "commander";

// Strict parsers for numeric options, so a malformed value exits with a usage
// error instead of reaching the app as NaN or a silently truncated number.

export function parseInteger(value: string) {
  if (!/^-?\d+$/.test(value)) {
    throw new InvalidArgumentError("Expected an integer.");
  }
  return Number(value);
}

// Accepts an optional trailing "s", since `--timeout 30s` reads naturally.
export function parseSeconds(value: string) {
  const match = /^(\d+\.?\d*|\.\d+)s?$/.exec(value);
  if (!match) {
    throw new InvalidArgumentError("Expected a number of seconds.");
  }
  return Number(match[1]);
}
