/**
 * Enterprise-Level Interactive CLI Prompts
 *
 * Enhanced utility functions for creating professional interactive prompts
 * with colors, keyboard navigation, search, and better UX
 */

import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import Table from "cli-table3";

/**
 * Clear the console
 */
export function clear(): void {
  console.clear();
}

/**
 * Display a separator line with styling
 */
export function separator(): void {
  console.log(chalk.gray("─".repeat(80)));
}

/**
 * Display a header with box styling
 */
export function header(title: string, subtitle?: string): void {
  const content = subtitle ? `${title}\n${chalk.gray(subtitle)}` : title;
  console.log(
    boxen(content, {
      padding: 1,
      borderColor: "cyan",
      borderStyle: "round",
      title: chalk.bold.cyan("CloudWrkz CLI"),
      titleAlignment: "center",
    })
  );
  console.log();
}

/**
 * Display a success message
 */
export function success(message: string): void {
  console.log(chalk.green("✓"), message);
}

/**
 * Display an error message
 */
export function error(message: string): void {
  console.log(chalk.red("✗"), message);
}

/**
 * Display a warning message
 */
export function warning(message: string): void {
  console.log(chalk.yellow("⚠"), message);
}

/**
 * Display an info message
 */
export function info(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}

/**
 * Prompt user for input with validation
 */
export async function prompt(
  question: string,
  options?: {
    default?: string;
    validate?: (input: string) => boolean | string;
    required?: boolean;
  }
): Promise<string> {
  const { answer } = await inquirer.prompt([
    {
      type: "input",
      name: "answer",
      message: chalk.cyan(question),
      default: options?.default,
      validate: (input: string) => {
        if (options?.required && !input.trim()) {
          return "This field is required";
        }
        if (options?.validate) {
          const result = options.validate(input);
          if (typeof result === "string") return result;
          if (!result) return "Invalid input";
        }
        return true;
      },
    },
  ]);
  return answer;
}

/**
 * Prompt for password (hidden input)
 */
export async function promptPassword(
  question: string,
  options?: {
    validate?: (input: string) => boolean | string;
    required?: boolean;
  }
): Promise<string> {
  const { password } = await inquirer.prompt([
    {
      type: "password",
      name: "password",
      message: chalk.cyan(question),
      mask: "•",
      validate: (input: string) => {
        if (options?.required && !input.trim()) {
          return "Password is required";
        }
        if (options?.validate) {
          const result = options.validate(input);
          if (typeof result === "string") return result;
          if (!result) return "Invalid password";
        }
        return true;
      },
    },
  ]);
  return password;
}

/**
 * Prompt user to select from a list of options
 */
export async function select(
  question: string,
  options: string[],
  displayNames?: string[]
): Promise<string> {
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: chalk.cyan(question),
      choices: displayNames || options,
      pageSize: 10,
    },
  ]);
  return options[displayNames ? displayNames.indexOf(choice) : options.indexOf(choice)];
}

/**
 * Prompt user with yes/no question
 */
export async function confirm(
  question: string,
  defaultValue: boolean = false
): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: chalk.cyan(question),
      default: defaultValue,
    },
  ]);
  return confirmed;
}

/**
 * Display a menu and return the selected option key
 * Enhanced with better visual design and keyboard navigation
 */
export async function menu(
  title: string,
  options: { key: string; label: string; description?: string; disabled?: boolean }[]
): Promise<string> {
  const choices = options.map((opt) => {
    if (opt.disabled) {
      return {
        name: `${chalk.gray(opt.label)} ${chalk.gray("(disabled)")}`,
        value: opt.key,
        disabled: true,
      };
    }
    if (opt.description) {
      return {
        name: `${chalk.bold(opt.label)}\n  ${chalk.gray(opt.description)}`,
        value: opt.key,
        short: opt.label,
      };
    }
    return {
      name: opt.label,
      value: opt.key,
    };
  });

  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: chalk.bold.cyan(title),
      choices,
      pageSize: 15,
    },
  ]);

  return choice;
}

/**
 * Create a searchable select prompt
 */
export async function searchSelect(
  question: string,
  options: string[],
  displayNames?: string[]
): Promise<string> {
  const choices = (displayNames || options).map((opt, idx) => ({
    name: opt,
    value: options[idx],
  }));

  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: chalk.cyan(question),
      choices,
      pageSize: 10,
    },
  ]);

  return choice;
}

/**
 * Create a checkbox prompt (multiple selections)
 */
export async function checkbox(
  question: string,
  options: string[],
  displayNames?: string[]
): Promise<string[]> {
  const choices = (displayNames || options).map((opt) => ({
    name: opt,
    value: options[displayNames ? displayNames.indexOf(opt) : options.indexOf(opt)],
  }));

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: chalk.cyan(question),
      choices,
      pageSize: 10,
    },
  ]);

  return selected;
}

/**
 * Create a loading spinner
 */
export function createSpinner(text: string): ora.Ora {
  return ora({
    text: chalk.cyan(text),
    spinner: "dots",
  });
}

/**
 * Create a formatted table
 */
export function createTable(headers: string[], options?: { colWidths?: number[] }): Table.Table {
  return new Table({
    head: headers.map((h) => chalk.bold.cyan(h)),
    colWidths: options?.colWidths,
    style: {
      head: ["cyan"],
      border: ["gray"],
    },
    chars: {
      top: "─",
      "top-mid": "┬",
      "top-left": "┌",
      "top-right": "┐",
      bottom: "─",
      "bottom-mid": "┴",
      "bottom-left": "└",
      "bottom-right": "┘",
      left: "│",
      "left-mid": "├",
      mid: "─",
      "mid-mid": "┼",
      right: "│",
      "right-mid": "┤",
      middle: "│",
    },
  });
}

/**
 * Display paginated list with search
 */
export async function paginatedSelect<T>(
  question: string,
  items: T[],
  displayFn: (item: T, index: number) => string,
  options?: {
    pageSize?: number;
    searchable?: boolean;
    emptyMessage?: string;
  }
): Promise<T | null> {
  if (items.length === 0) {
    if (options?.emptyMessage) {
      console.log(chalk.yellow(options.emptyMessage));
    }
    return null;
  }

  const pageSize = options?.pageSize || 10;

  const choices = items.map((item, index) => ({
    name: displayFn(item, index),
    value: item,
  }));

  const { selected } = await inquirer.prompt([
    {
      type: "list",
      name: "selected",
      message: chalk.cyan(question),
      choices,
      pageSize: Math.min(pageSize, items.length),
    },
  ]);

  return selected;
}

/**
 * Display paginated checkbox list for multiple selections
 */
export async function paginatedCheckbox<T>(
  question: string,
  items: T[],
  displayFn: (item: T, index: number) => string,
  options?: {
    pageSize?: number;
    emptyMessage?: string;
  }
): Promise<T[]> {
  if (items.length === 0) {
    if (options?.emptyMessage) {
      console.log(chalk.yellow(options.emptyMessage));
    }
    return [];
  }

  const pageSize = options?.pageSize || 15;

  const choices = items.map((item, index) => ({
    name: displayFn(item, index),
    value: item,
  }));

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: chalk.cyan(question),
      choices,
      pageSize: Math.min(pageSize, items.length),
    },
  ]);

  return selected || [];
}

/**
 * Format status with colors
 */
export function formatStatus(status: string): string {
  const statusMap: Record<string, (text: string) => string> = {
    ACTIVE: chalk.green,
    PENDING: chalk.yellow,
    SUSPENDED: chalk.red,
    DELETED: chalk.gray,
  };
  const formatter = statusMap[status] || chalk.white;
  return formatter(status);
}

/**
 * Format role with colors
 */
export function formatRole(role: string): string {
  const roleMap: Record<string, (text: string) => string> = {
    ADMIN: chalk.red.bold,
    MODERATOR: chalk.blue.bold,
    AGENT: chalk.cyan.bold,
    USER: chalk.gray,
  };
  const formatter = roleMap[role] || chalk.white;
  return formatter(role);
}

/**
 * Display a section header
 */
export function sectionHeader(title: string): void {
  console.log();
  console.log(chalk.bold.cyan("▸"), chalk.bold.white(title));
  separator();
}

/**
 * Display key-value pairs in a formatted way
 */
export function displayKeyValue(key: string, value: string | number | null | undefined): void {
  const formattedValue = value === null || value === undefined ? chalk.gray("-") : String(value);
  console.log(chalk.gray(`${key.padEnd(20)}`), formattedValue);
}

/**
 * Display a notice box
 */
export function notice(message: string, type: "info" | "warning" | "error" | "success" = "info"): void {
  const colors = {
    info: "blue",
    warning: "yellow",
    error: "red",
    success: "green",
  };
  const icons = {
    info: "ℹ",
    warning: "⚠",
    error: "✗",
    success: "✓",
  };

  console.log(
    boxen(`${chalk[colors[type]](icons[type])} ${message}`, {
      padding: 1,
      borderColor: colors[type],
      borderStyle: "round",
    })
  );
}

/**
 * Wait for user to press Enter
 */
export async function waitForEnter(message: string = "Press Enter to continue..."): Promise<void> {
  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: chalk.gray(message),
    },
  ]);
}
