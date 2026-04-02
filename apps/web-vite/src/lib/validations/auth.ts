import { z } from "zod";
import { registerPasswordIssues } from "@/lib/auth/passwordStrength";

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim(),
  email: z
    .string()
    .email("Please enter a valid email address")
    .toLowerCase()
    .trim()
    .max(255, "Email must be less than 255 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters")
    .superRefine((val, ctx) => {
      if (val.length < 8 || val.length > 128) return;
      const issues = registerPasswordIssues(val).filter((m) => !m.startsWith("Use at least 8"));
      if (issues.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issues[0]!,
        });
      }
    }),
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message: "You must agree to the terms and conditions",
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address")
    .toLowerCase()
    .trim(),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;
