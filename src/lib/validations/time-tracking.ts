import { z } from "zod";

export const createTimeEntrySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ticketId: z.string().optional(),
  billable: z.boolean().optional(),
});

export const addTimeEntrySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ticketId: z.string().optional(),
  billable: z.boolean().optional(),
  duration: z.object({
    hours: z.number().min(0).max(23),
    minutes: z.number().min(0).max(59),
    seconds: z.number().min(0).max(59),
  }),
  startedAt: z.date(),
  stoppedAt: z.date().optional(),
});

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type AddTimeEntryInput = z.infer<typeof addTimeEntrySchema>;
