// Human: Todo/task form schemas that sanitize rich-text descriptions and normalize optional numeric date fields.
// Agent: CALLS sanitizeHtml on description transform; COERCES estimatedHours union; EXPORTS createTodoSchema updateTodoSchema types.

import { z } from "zod";
import { sanitizeHtml } from "@/lib/utils/html-sanitizer";

export const createTodoSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be less than 200 characters")
    .trim(),
  description: z
    .string()
    .max(50000, "Description is too long")
    .transform((html) => (html ? sanitizeHtml(html) : ""))
    .optional()
    .or(z.literal("")),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]).default("NOT_STARTED"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assignedToId: z.string().optional().or(z.literal("")),
  estimatedHours: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === "" || val === undefined || val === null) return undefined;
      const num = typeof val === "string" ? parseFloat(val) : val;
      return Number.isNaN(num) ? undefined : num;
    })
    .refine((val) => val === undefined || (val >= 0 && val <= 10000), {
      message: "Estimated hours must be between 0 and 10000",
    }),
  startDate: z.string().optional().or(z.literal("")).transform((val) => (val === "" ? undefined : val)),
  dueDate: z.string().optional().or(z.literal("")).transform((val) => (val === "" ? undefined : val)),
  ticketId: z.string().optional().or(z.literal("")),
});

export type CreateTodoInput = z.infer<typeof createTodoSchema>;

export const updateTodoSchema = z.object({
  title: z.string().min(3).max(200).trim().optional(),
  description: z
    .string()
    .max(50000)
    .transform((html) => (html ? sanitizeHtml(html) : ""))
    .optional()
    .or(z.literal("")),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().optional().or(z.literal("")),
  estimatedHours: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === "" || val === undefined || val === null) return undefined;
      const num = typeof val === "string" ? parseFloat(val) : val;
      return Number.isNaN(num) ? undefined : num;
    }),
  startDate: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
  ticketId: z.string().optional().or(z.literal("")),
});

export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
