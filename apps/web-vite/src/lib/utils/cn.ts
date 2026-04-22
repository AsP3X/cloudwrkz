// Human: Merges conditional class names and resolves Tailwind conflicts for readable component `className` strings.
// Agent: CALLS clsx then twMerge; READS ClassValue[]; RETURNS string; DEPENDS clsx tailwind-merge.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
