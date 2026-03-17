import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

/**
 * GET /api/favicons/:filename
 *
 * Serves cached favicon images from public/uploads/favicons/.
 *
 * This route lives under /api/ so it is excluded from reverse-proxy
 * authentication checks (which typically only protect non-API paths).
 * The iOS app includes a Bearer token for additional safety, but the
 * /api/ prefix is the primary mechanism that allows the request through.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  if (!/^[\w.-]+$/.test(filename)) {
    return new NextResponse(null, { status: 400 });
  }

  const filepath = join(
    process.cwd(),
    "public",
    "uploads",
    "favicons",
    filename
  );

  if (!existsSync(filepath)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const buffer = await readFile(filepath);

    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "ico"
          ? "image/x-icon"
          : ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "svg"
              ? "image/svg+xml"
              : "application/octet-stream";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
