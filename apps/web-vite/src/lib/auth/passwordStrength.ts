// Human: Client-side password quality heuristics for signup and the strength meter, including common-password and pattern checks.
// Agent: READS TOP_1000 set; analyzePasswordStrength USES pwnedCount optional; registerPasswordIssues RETURNS string[] issues.

import { TOP_1000_COMMON_PASSWORDS } from "@/lib/auth/top1000Passwords";

const COMMON_PASSWORD_SET = new Set(
  TOP_1000_COMMON_PASSWORDS.map((p) => p.toLowerCase()),
);

const KEYBOARD_ROWS = [
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1234567890",
  "qwertzuiop",
  "azertyuiop",
];

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

function hasSequentialRun(s: string, minLen: number): boolean {
  const lower = s.toLowerCase();
  for (let i = 0; i <= lower.length - minLen; i++) {
    const slice = lower.slice(i, i + minLen);
    if (
      isAscendingRun(slice, ALPHABET) ||
      isDescendingRun(slice, ALPHABET) ||
      isAscendingRun(slice, DIGITS) ||
      isDescendingRun(slice, DIGITS)
    ) {
      return true;
    }
  }
  return false;
}

function isAscendingRun(slice: string, alphabet: string): boolean {
  let idx = alphabet.indexOf(slice[0]!);
  if (idx === -1) return false;
  for (let j = 1; j < slice.length; j++) {
    if (alphabet[idx + 1] !== slice[j]) return false;
    idx += 1;
  }
  return true;
}

function isDescendingRun(slice: string, alphabet: string): boolean {
  let idx = alphabet.indexOf(slice[0]!);
  if (idx === -1) return false;
  for (let j = 1; j < slice.length; j++) {
    if (alphabet[idx - 1] !== slice[j]) return false;
    idx -= 1;
  }
  return true;
}

function hasKeyboardFragment(password: string): boolean {
  const lower = password.toLowerCase();
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i <= row.length - 3; i++) {
      const forward = row.slice(i, i + 3);
      const backward = forward.split("").reverse().join("");
      if (lower.includes(forward) || lower.includes(backward)) return true;
    }
  }
  return false;
}

function hasRepeatingRun(password: string): boolean {
  return /(.)\1{2,}/.test(password);
}

// Human: Fast membership check against the bundled top-1,000 password list (case-insensitive).
// Agent: READS COMMON_PASSWORD_SET; NORMALIZES trim toLowerCase; RETURNS boolean.

export function isCommonPassword(password: string): boolean {
  const key = password.trim().toLowerCase();
  return key.length > 0 && COMMON_PASSWORD_SET.has(key);
}

export type PasswordStrengthAnalysis = {
  /** 0–100 for bar width */
  score: number;
  label: string;
  /** Tailwind color token suffix for the bar (e.g. error-500) */
  barColorClass: string;
};

const COMPOSITION_WEIGHT = 16;
const SECURITY_WEIGHT = 10;

type StrengthOpts = {
  /** From Have I Been Pwned Pwned Passwords API; `null` = not checked yet or check failed. */
  pwnedCount?: number | null;
};

/**
 * Heuristic strength for UI bar: length, mixed character classes, and penalties for
 * leaked-password lists and predictable patterns.
 */
// Human: Produces a 0–100 score, human label, and bar color class for the password meter, factoring in HIBP breach counts when known.
// Agent: READS password string opts.pwnedCount; COMPUTES score penalties common sequential keyboard; RETURNS PasswordStrengthAnalysis.

export function analyzePasswordStrength(
  password: string,
  opts?: StrengthOpts,
): PasswordStrengthAnalysis {
  if (!password) {
    return { score: 0, label: "", barColorClass: "bg-neutral-300 dark:bg-neutral-600" };
  }

  const hasMinLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  let score = 0;
  if (hasMinLength) score += COMPOSITION_WEIGHT;
  if (hasLower) score += COMPOSITION_WEIGHT;
  if (hasUpper) score += COMPOSITION_WEIGHT;
  if (hasDigit) score += COMPOSITION_WEIGHT;
  if (hasSpecial) score += COMPOSITION_WEIGHT;

  const common = isCommonPassword(password);
  const repeating = hasRepeatingRun(password);
  const sequential = hasSequentialRun(password, 3);
  const keyboard = hasKeyboardFragment(password);

  if (!common) score += SECURITY_WEIGHT;
  if (!repeating) score += Math.round(SECURITY_WEIGHT * 0.35);
  if (!sequential) score += Math.round(SECURITY_WEIGHT * 0.35);
  if (!keyboard) score += Math.round(SECURITY_WEIGHT * 0.3);

  if (common) score = Math.min(score, 18);
  if (repeating) score = Math.max(0, score - 22);
  if (sequential) score = Math.max(0, score - 18);
  if (keyboard) score = Math.max(0, score - 18);

  const breachCount = opts?.pwnedCount != null && opts.pwnedCount > 0 ? opts.pwnedCount : 0;
  if (breachCount > 0) score = Math.min(score, 15);

  score = Math.min(100, Math.round(score));

  let label: string;
  let barColorClass: string;
  if (breachCount > 0) {
    label = `Known breached password (${breachCount.toLocaleString()} exposures) — choose another`;
    barColorClass = "bg-error-500 dark:bg-error-400";
  } else if (common) {
    label = "This password is too common — choose a different one";
    barColorClass = "bg-error-500 dark:bg-error-400";
  } else if (score < 35) {
    label = "Weak";
    barColorClass = "bg-error-500 dark:bg-error-400";
  } else if (score < 55) {
    label = "Fair";
    barColorClass = "bg-amber-500 dark:bg-amber-400";
  } else if (score < 80) {
    label = "Good";
    barColorClass = "bg-primary-500 dark:bg-primary-400";
  } else {
    label = "Strong";
    barColorClass = "bg-success-600 dark:bg-success-500";
  }

  return { score, label, barColorClass };
}

// Human: Enumerates registration-blocking password problems for Zod `superRefine` and inline field hints.
// Agent: READS password; CALLS isCommonPassword has* helpers; RETURNS string[] messages; ORDER length rules first.

export function registerPasswordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push("Use at least 8 characters");
  if (!/[a-z]/.test(password)) issues.push("Add a lowercase letter");
  if (!/[A-Z]/.test(password)) issues.push("Add an uppercase letter");
  if (!/\d/.test(password)) issues.push("Add a number");
  if (!/[^a-zA-Z0-9]/.test(password)) issues.push("Add a special character");
  if (isCommonPassword(password)) issues.push("This password is in the top 1,000 most common — pick another");
  if (hasRepeatingRun(password)) issues.push("Avoid repeating the same character (e.g. aaa)");
  if (hasSequentialRun(password, 3)) issues.push("Avoid simple sequences like 123 or abc");
  if (hasKeyboardFragment(password)) issues.push("Avoid keyboard rows like qwe or asd");
  return issues;
}
