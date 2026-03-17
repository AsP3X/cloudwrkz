"use server";

import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/server/utils/audit-log";
import { hashPassword, verifyPassword, generateToken, getTokenExpiration } from "@/lib/utils/auth";
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "@/lib/validations/auth";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

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

    // Check if user already exists (excluding deleted accounts)
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        status: {
          not: "DELETED", // Allow re-registration if account was deleted
        },
      },
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
      const headerStore = await headers();
      const ipAddress = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || null;
      const userAgent = headerStore.get("user-agent") || null;
      auditLog({
        action: "auth.login.attempt",
        resourceType: "auth",
        context: {
          outcome: "failure",
          failureReason: "validation_error",
          emailUsed: (input as { email?: string }).email?.toLowerCase?.()?.trim?.(),
        },
        ipAddress,
        userAgent,
      });
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    const {
      email,
      password,
      rememberMe,
      deviceId,
      deviceName,
      deviceType,
      deviceOs,
      deviceBrowser,
      userAgent: clientReportedUserAgent,
    } = validationResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const headerStore = await headers();
    const ipAddress = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || null;
    const serverUserAgent = headerStore.get("user-agent") || null;
    const effectiveUserAgent = clientReportedUserAgent || serverUserAgent || null;
    const loginAuditContext = {
      emailUsed: normalizedEmail,
      rememberMe,
      deviceId: deviceId ?? undefined,
      deviceName: deviceName ?? undefined,
      deviceType: deviceType ?? undefined,
      deviceOs: deviceOs ?? undefined,
      deviceBrowser: deviceBrowser ?? undefined,
      userAgent: effectiveUserAgent ?? undefined,
    };

    // Find user by email or originalEmail (for deleted users)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { originalEmail: normalizedEmail },
        ],
      },
      select: {
        id: true,
        email: true,
        originalEmail: true,
        name: true,
        password: true,
        status: true,
        emailVerified: true,
        role: true,
      },
    });

    if (!user) {
      auditLog({
        action: "auth.login.attempt",
        resourceType: "auth",
        context: { outcome: "failure", failureReason: "invalid_credentials", ...loginAuditContext },
        ipAddress,
        userAgent: effectiveUserAgent,
      });
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    // Check if account is deleted - show specific error message
    if (user.status === "DELETED") {
      auditLog({
        action: "auth.login.attempt",
        userId: null,
        resourceType: "user",
        resourceId: user.id,
        context: { outcome: "failure", failureReason: "account_deleted", ...loginAuditContext },
        ipAddress,
        userAgent: effectiveUserAgent,
      });
      return {
        success: false,
        error: "This account has been deleted. Please contact an administrator to reactivate your account.",
      };
    }

    // Verify password first
    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      auditLog({
        action: "auth.login.attempt",
        userId: null,
        resourceType: "user",
        resourceId: user.id,
        context: { outcome: "failure", failureReason: "invalid_credentials", ...loginAuditContext },
        ipAddress,
        userAgent: effectiveUserAgent,
      });
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    // Check if account is banned - allow login but redirect to banned page
    if (user.status === "BANNED") {
      // Create session for banned users so they can access the banned page
      const cookieStore = await cookies();
      const sessionToken = generateToken();
      const expiresAt = new Date();
      expiresAt.setTime(expiresAt.getTime() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)); // 30 days or 1 day

      const session = await prisma.session.create({
        data: {
          token: sessionToken,
          userId: user.id,
          expiresAt,
          deviceId,
          deviceName,
          deviceType,
          deviceOs,
          deviceBrowser,
          userAgent: effectiveUserAgent ?? undefined,
          ipAddress: ipAddress ?? undefined,
        },
      });

      auditLog({
        action: "auth.login.attempt",
        userId: user.id,
        resourceType: "session",
        resourceId: session.id,
        context: {
          outcome: "failure",
          failureReason: "account_banned",
          sessionId: session.id,
          ...loginAuditContext,
        },
        ipAddress,
        userAgent: effectiveUserAgent,
      });

      cookieStore.set("session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24, // 30 days or 1 day
        path: "/",
      });

      // Return a special error code that will trigger redirect to banned page
      return {
        success: false,
        error: "BANNED",
      };
    }

    // Check if account is active
    if (user.status === "SUSPENDED") {
      auditLog({
        action: "auth.login.attempt",
        userId: null,
        resourceType: "user",
        resourceId: user.id,
        context: { outcome: "failure", failureReason: "account_suspended", ...loginAuditContext },
        ipAddress,
        userAgent: effectiveUserAgent,
      });
      return {
        success: false,
        error: "Your account has been suspended. Please contact support.",
      };
    }

    // Update last login on the user record
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress ?? undefined,
      },
    });

    // Create session token and store in database
    const cookieStore = await cookies();
    const sessionToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)); // 30 days or 1 day

    const session = await prisma.session.create({
      data: {
        token: sessionToken,
        userId: user.id,
        expiresAt,
        deviceId,
        deviceName,
        deviceType,
        deviceOs,
        deviceBrowser,
        userAgent: effectiveUserAgent ?? undefined,
        ipAddress: ipAddress ?? undefined,
      },
    });

    auditLog({
      action: "auth.login.attempt",
      userId: user.id,
      resourceType: "session",
      resourceId: session.id,
      context: {
        outcome: "success",
        sessionId: session.id,
        ...loginAuditContext,
      },
      ipAddress,
      userAgent: effectiveUserAgent,
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
    auditLog({
      action: "auth.login.attempt",
      resourceType: "auth",
      context: { outcome: "failure", failureReason: "server_error" },
    });
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

    if (sessionToken) {
      const session = await prisma.session.findUnique({
        where: { token: sessionToken },
        select: { id: true, userId: true },
      });
      await prisma.session.deleteMany({
        where: { token: sessionToken },
      });
      if (session?.userId) {
        const headerStore = await headers();
        const ipAddress = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || null;
        const userAgent = headerStore.get("user-agent") || null;
        auditLog({
          action: "auth.logout",
          userId: session.userId,
          resourceType: "session",
          resourceId: session.id,
          context: {},
          ipAddress,
          userAgent,
        });
      }
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
 * Set session cookie from a session token obtained via QR login (browser polling got status=APPROVED).
 * Validates that the token exists and is not expired, then sets the session cookie.
 */
export async function setSessionFromQrLogin(
  sessionToken: string
): Promise<ActionResult<{ userId: string; email: string; name: string | null }>> {
  try {
    if (!sessionToken || typeof sessionToken !== "string" || sessionToken.length > 200) {
      return { success: false, error: "Invalid session token." };
    }

    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            emailVerified: true,
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      return { success: false, error: "Session not found or expired." };
    }
    if (session.user.status !== "ACTIVE" || !session.user.emailVerified) {
      return { success: false, error: "Account is not active or verified." };
    }

    const cookieStore = await cookies();
    const maxAge = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
    cookieStore.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.min(maxAge, 60 * 60 * 24), // cap at 1 day
      path: "/",
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/login");

    return {
      success: true,
      data: {
        userId: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      message: "Signed in successfully.",
    };
  } catch (error) {
    console.error("setSessionFromQrLogin error:", error);
    return {
      success: false,
      error: "Failed to complete sign in.",
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
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        status: {
          not: "DELETED", // Allow re-registration if account was deleted
        },
      },
      select: { id: true },
    });

    return { available: !user };
  } catch (error) {
    console.error("Email availability check error:", error);
    return { available: false };
  }
}
