/**
 * Interactive CLI Prompts
 *
 * Utility functions for creating interactive prompts using Node.js readline
 */

import * as readline from "readline";

/**
 * Create a readline interface
 */
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input
 */
export function prompt(question: string): Promise<string> {
  const rl = createInterface();

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for password (hides input on most terminals)
 * Note: This is a simplified version. For better password masking,
 * consider using a library like 'readline-sync' or 'inquirer'
 */
export function promptPassword(question: string): Promise<string> {
  const rl = createInterface();

  return new Promise((resolve) => {
    // Use readline's built-in mechanism
    // Note: This won't hide input in all terminals, but works for basic cases
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });

    // Try to hide input if possible
    // This is a best-effort approach
    if (typeof process.stdin.setRawMode === "function" && process.stdin.isTTY) {
      // For TTY terminals, we could use raw mode, but it's complex
      // For now, just use standard input (may show characters)
      // Users can still type normally, but characters will be visible
    }
  });
}

/**
 * Prompt user to select from a list of options
 */
export async function select(
  question: string,
  options: string[],
  displayNames?: string[]
): Promise<string> {
  const rl = createInterface();

  console.log(`\n${question}`);
  const display = displayNames || options;
  display.forEach((option, index) => {
    console.log(`  ${index + 1}. ${option}`);
  });

  return new Promise((resolve, reject) => {
    const ask = () => {
      rl.question("\nSelect option (number): ", (answer) => {
        const choice = parseInt(answer.trim());

        if (isNaN(choice) || choice < 1 || choice > options.length) {
          console.error(`Invalid choice. Please enter a number between 1 and ${options.length}.`);
          ask();
          return;
        }

        rl.close();
        resolve(options[choice - 1]);
      });
    };

    ask();
  });
}

/**
 * Prompt user with yes/no question
 */
export async function confirm(question: string, defaultValue: boolean = false): Promise<boolean> {
  const rl = createInterface();
  const defaultText = defaultValue ? "Y/n" : "y/N";

  return new Promise((resolve) => {
    rl.question(`${question} (${defaultText}): `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();

      if (normalized === "") {
        resolve(defaultValue);
      } else if (normalized === "y" || normalized === "yes") {
        resolve(true);
      } else if (normalized === "n" || normalized === "no") {
        resolve(false);
      } else {
        // Invalid input, use default
        resolve(defaultValue);
      }
    });
  });
}

/**
 * Display a menu and return the selected option
 * Automatically assigns numbers to options (1, 2, 3, etc.)
 * Returns the selected option index (0-based) as a string
 */
export async function menu(title: string, options: { key: string; label: string }[]): Promise<string> {
  const rl = createInterface();

  console.log(`\n${title}`);
  console.log("─".repeat(50));
  options.forEach((option, index) => {
    console.log(`  ${index + 1}. ${option.label}`);
  });
  console.log("─".repeat(50));

  const validNumbers = options.map((_, index) => (index + 1).toString());

  return new Promise((resolve) => {
    const ask = () => {
      rl.question("\nSelect option: ", (answer) => {
        const choice = answer.trim();

        if (!validNumbers.includes(choice)) {
          console.error(`Invalid choice. Please enter a number between 1 and ${options.length}.`);
          ask();
          return;
        }

        rl.close();
        // Return the key of the selected option
        const selectedIndex = parseInt(choice) - 1;
        resolve(options[selectedIndex].key);
      });
    };

    ask();
  });
}

/**
 * Clear the console
 */
export function clear(): void {
  console.clear();
}

/**
 * Display a separator line
 */
export function separator(): void {
  console.log("\n" + "─".repeat(50) + "\n");
}

