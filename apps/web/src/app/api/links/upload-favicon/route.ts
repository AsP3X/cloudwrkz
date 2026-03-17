import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import sharp from "sharp";

// Favicon images are typically very small; keep the limit tight.
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_MIME_TYPES = ["image/x-icon", "image/vnd.microsoft.icon", "image/png", "image/gif", "image/jpeg", "image/webp", "image/svg+xml"];

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
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
        { error: "Invalid file type. Only image favicon formats are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 1MB limit" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    // Normalize all uploaded favicons to PNG so all consumers
    // can rely on a single image format.
    const filename = `favicon-${timestamp}-${randomString}.png`;

    const uploadsDir = join(process.cwd(), "public", "uploads", "favicons");
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const originalBuffer = Buffer.from(bytes);
    const filepath = join(uploadsDir, filename);

    try {
      const pngBuffer = await sharp(originalBuffer)
        .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      await writeFile(filepath, pngBuffer);
    } catch (error) {
      console.error("Favicon upload conversion error:", error);
      return NextResponse.json(
        { error: "Failed to process favicon image" },
        { status: 500 }
      );
    }

    const url = `/uploads/favicons/${filename}`;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Favicon upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload favicon" },
      { status: 500 }
    );
  }
}

