import { z } from "zod";

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
    .max(5000, "Description must be less than 5000 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  type: z.enum(["BUG", "FEATURE", "QUESTION", "SUPPORT", "TASK"]).default("SUPPORT"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
