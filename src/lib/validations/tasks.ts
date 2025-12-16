import { z } from "zod";
import { sanitizeHtml } from "@/lib/utils/rich-text";

/**
 * Task creation schema
 */
export const createTaskSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be less than 200 characters")
    .trim(),
  description: z
    .string()
    .max(50000, "Description is too long")
    .transform((html) => html ? sanitizeHtml(html) : "")
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
      return isNaN(num) ? undefined : num;
    })
    .refine((val) => val === undefined || (val >= 0 && val <= 10000), {
      message: "Estimated hours must be between 0 and 10000",
    }),
  startDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),
  dueDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),
  ticketId: z.string().optional().or(z.literal("")),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Task update schema
 */
export const updateTaskSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be less than 200 characters")
    .trim()
    .optional(),
  description: z
    .string()
    .max(50000, "Description is too long")
    .transform((html) => html ? sanitizeHtml(html) : "")
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
      return isNaN(num) ? undefined : num;
    })
    .refine((val) => val === undefined || (val >= 0 && val <= 10000), {
      message: "Estimated hours must be between 0 and 10000",
    }),
  startDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),
  dueDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),
  ticketId: z.string().optional().or(z.literal("")),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
