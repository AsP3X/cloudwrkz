"use server";

import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword, generateToken, getTokenExpiration } from "@/lib/utils/auth";
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "@/lib/validations/auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Register a new user
 */
export async function registerUser(
  input: RegisterInput
): Promise<ActionResult<{ userId: string; email: string }>> {
  try {
    // Validate input
    const validationResult = registerSchema.safeParse(input);
    
    if (!validationResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      validationResult.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(err.message);
      });

      return {
        success: false,
        error: "Validation failed",
        fieldErrors,
      };
    }

    const { name, email, password, agreeToTerms } = validationResult.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return {
        success: false,
        error: "An account with this email already exists",
      };
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate email verification token
    const emailVerificationToken = generateToken();
    const emailVerificationExpires = getTokenExpiration(24); // 24 hours

    // Create user with explicit USER role
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        emailVerificationToken,
        emailVerificationExpires,
        status: "PENDING", // User needs to verify email
        role: "USER", // Explicitly set role to USER
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    // TODO: Send verification email
    // await sendVerificationEmail(user.email, emailVerificationToken);

    // Revalidate any relevant paths
    revalidatePath("/register");
    revalidatePath("/login");

    return {
      success: true,
      data: {
        userId: user.id,
        email: user.email,
      },
      message: "Account created successfully! Please check your email to verify your account.",
    };
  } catch (error) {
    console.error("Registration error:", error);

    // Handle Prisma errors
    if (error instanceof Error) {
      // Check for unique constraint violation
      if (error.message.includes("Unique constraint")) {
        return {
          success: false,
          error: "An account with this email already exists",
        };
      }
    }

    return {
      success: false,
      error: "An error occurred while creating your account. Please try again.",
    };
  }
}

/**
 * Login user
 */
export async function loginUser(
  input: LoginInput
): Promise<ActionResult<{ userId: string; email: string; name: string | null }>> {
  try {
    // Validate input
    const validationResult = loginSchema.safeParse(input);
    
    if (!validationResult.success) {
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    const { email, password, rememberMe } = validationResult.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        status: true,
        emailVerified: true,
        role: true,
      },
    });

    if (!user) {
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    // Check if account is active
    if (user.status === "SUSPENDED") {
      return {
        success: false,
        error: "Your account has been suspended. Please contact support.",
      };
    }

    if (user.status === "DELETED") {
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        // Note: In production, you'd want to get the actual IP from the request
        // lastLoginIp: getClientIp(request),
      },
    });

    // Create session token and store in database
    const cookieStore = await cookies();
    const sessionToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)); // 30 days or 1 day
    
    // Store session in database
    await prisma.session.create({
      data: {
        token: sessionToken,
        userId: user.id,
        expiresAt,
      },
    });
    
    cookieStore.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24, // 30 days or 1 day
      path: "/",
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/login");

    return {
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
      },
      message: "Login successful",
    };
  } catch (error) {
    console.error("Login error:", error);

    return {
      success: false,
      error: "An error occurred while signing in. Please try again.",
    };
  }
}

/**
 * Logout user
 */
export async function logoutUser(): Promise<ActionResult> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session")?.value;
    
    // Delete session from database if token exists
    if (sessionToken) {
      await prisma.session.deleteMany({
        where: { token: sessionToken },
      });
    }
    
    cookieStore.delete("session");

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/login");

    return {
      success: true,
      message: "Logged out successfully",
    };
  } catch (error) {
    console.error("Logout error:", error);
    return {
      success: false,
      error: "An error occurred while logging out",
    };
  }
}

/**
 * Check if email is already registered
 */
export async function checkEmailAvailability(
  email: string
): Promise<{ available: boolean }> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });

    return { available: !user };
  } catch (error) {
    console.error("Email availability check error:", error);
    return { available: false };
  }
}
