import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * GET /api/profile/avatar/[filename]
 * Serves avatar image from public/uploads/avatars so it works in standalone
 * (where static public folder may not be copied). Filename must be safe (no path traversal).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    if (!filename || filename.length > 200) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    // Only allow safe filenames: alphanumeric, dash, dot (e.g. userId-timestamp.jpg)
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const filepath = join(process.cwd(), "public", "uploads", "avatars", filename);
    if (!existsSync(filepath)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = await readFile(filepath);
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Avatar serve error:", error);
    return NextResponse.json({ error: "Failed to load image" }, { status: 500 });
  }
}
