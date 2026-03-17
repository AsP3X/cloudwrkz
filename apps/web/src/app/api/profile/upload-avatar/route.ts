import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { prisma } from "@/lib/db/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB – client should downscale to stay under
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/**
 * POST /api/profile/upload-avatar
 * Authorization: Bearer <session token>
 * Body: multipart/form-data with "file" (image, max 1MB).
 * Saves to public/uploads/avatars/{userId}-{timestamp}.jpg and sets user.avatar to the public URL.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromBearerToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, and WebP are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 1MB limit. Please use a smaller image." },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `${user.id}-${timestamp}.${ext}`;

    const uploadsDir = join(process.cwd(), "public", "uploads", "avatars");
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filepath = join(uploadsDir, filename);
    await writeFile(filepath, buffer);

    const url = `/uploads/avatars/${filename}`;

    await prisma.user.update({
      where: { id: user.id },
      data: { avatar: url },
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Profile avatar upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload avatar" },
      { status: 500 }
    );
  }
}
