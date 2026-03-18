import { z } from "zod";

export const createTicketSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be less than 200 characters")
    .trim(),
  description: z.string().max(50000, "Description is too long").optional().or(z.literal("")),
  type: z.enum(["BUG", "FEATURE", "QUESTION", "SUPPORT", "TASK"]).default("BUG"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assignedToId: z.string().optional().or(z.literal("")),
  assignedToGroupId: z.string().optional().or(z.literal("")),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
