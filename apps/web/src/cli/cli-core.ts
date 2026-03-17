/**
 * Shared helpers for CloudWrkz CLI tools.
 *
 * The goal is to centralize common argument parsing and flag handling
 * so that individual CLI modules can stay focused on their domain
 * logic instead of duplicating boilerplate.
 */

export type FlagValue = string | boolean;

export type FlagMap = Record<string, FlagValue>;

/**
 * Parse CLI-style flags from an argument list.
 *
 * Supported formats:
 *   --key=value   -> { key: "value" }
 *   --flag        -> { flag: true }
 *
 * Positional arguments should be handled separately by each CLI
 * (typically using a pre-sliced `commandArgs` array).
 */
export function parseFlags(args: string[]): FlagMap {
  const parsed: FlagMap = {};

  for (const arg of args) {
    if (!arg.startsWith("--")) continue;

    const withoutPrefix = arg.substring(2);
    if (!withoutPrefix) continue;

    const [rawKey, ...rest] = withoutPrefix.split("=");
    const key = rawKey.trim();
    if (!key) continue;

    const value = rest.length > 0 ? rest.join("=").trim() : undefined;
    parsed[key] = value !== undefined && value !== "" ? value : true;
  }

  return parsed;
}

