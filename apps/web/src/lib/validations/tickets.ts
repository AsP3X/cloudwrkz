import { z } from "zod";
import { sanitizeHtml } from "@/lib/utils/rich-text";

/**
 * Ticket creation schema
 */
export const createTicketSchema = z.object({
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
  type: z.enum(["BUG", "FEATURE", "QUESTION", "SUPPORT", "TASK"]).default("BUG"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  createdForUserId: z.string().optional().or(z.literal("")), // For agents to create tickets for other users
  assignedToId: z.string().optional().or(z.literal("")), // For agents to assign tickets to agents
  assignedToGroupId: z.string().optional().or(z.literal("")), // For assigning tickets to groups
  createTimer: z.boolean().optional().default(false), // Create a timer for this ticket
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/**
 * Ticket update schema
 */
export const updateTicketSchema = z.object({
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
  type: z.enum(["BUG", "FEATURE", "QUESTION", "SUPPORT", "TASK"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  status: z.enum(["OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED", "CANCELLED"]),
  assignedToId: z.string().optional().or(z.literal("")),
  assignedToGroupId: z.string().optional().or(z.literal("")), // For assigning tickets to groups
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
