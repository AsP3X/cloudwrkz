import { NextResponse } from "next/server";
import { registerUser } from "@/server/actions/auth";

/**
 * POST /api/register
 * JSON body: { name: string, email: string, password: string, confirmPassword: string }
 * agreeToTerms is required by the backend; the app sends true when the user creates an account.
 * Returns 201 { message: string, userId?: string, email?: string } on success.
 * Returns 400 { message: string, fieldErrors?: Record<string, string[]> } on validation/error.
 * Used by the iOS app; web registration uses the server action.
 *
 * GET returns 405 so you can verify the route is deployed.
 */
export async function GET() {
  return NextResponse.json(
    { message: "Use POST with { name, email, password, confirmPassword } to register." },
    { status: 405 }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await registerUser({
      name: body?.name ?? "",
      email: body?.email ?? "",
      password: body?.password ?? "",
      confirmPassword: body?.confirmPassword ?? "",
      agreeToTerms: true,
    });

    if (result.success) {
      return NextResponse.json(
        {
          message: result.message ?? "Account created successfully.",
          userId: result.data?.userId,
          email: result.data?.email,
        },
        { status: 201 }
      );
    }

    const status = 400;
    const payload: { message: string; fieldErrors?: Record<string, string[]> } = {
      message: result.error ?? "Registration failed",
    };
    if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
      payload.fieldErrors = result.fieldErrors;
    }
    return NextResponse.json(payload, { status });
  } catch (error) {
    console.error("[api/register]", error);
    return NextResponse.json(
      { message: "An error occurred while creating your account. Please try again." },
      { status: 500 }
    );
  }
}
