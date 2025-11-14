"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";

export async function logout() {
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

    return { success: true };
  } catch (error) {
    console.error("Logout error:", error);
    return { success: false, error: "Failed to logout" };
  }
}
