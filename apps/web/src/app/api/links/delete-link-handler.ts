import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { deleteLinkWithUserId } from "@/server/actions/links";

/**
 * DELETE /api/links/[id] and /api/auth/links/[id] (iOS app).
 * Returns 200/204 or 401/403/404/500.
 */
export async function deleteLinkApiHandler(
  request: NextRequest,
  linkId: string
): Promise<NextResponse> {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const linksEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!linksEnabled) {
      return NextResponse.json(
        { message: "Links module is not enabled" },
        { status: 403 }
      );
    }

    const result = await deleteLinkWithUserId(user.id, linkId);

    if (!result.success) {
      const status =
        result.error === "Link not found"
          ? 404
          : result.error?.includes("permission")
            ? 403
            : 400;
      return NextResponse.json(
        { message: result.error ?? "Failed to delete link" },
        { status }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/links/[id]]", error);
    return NextResponse.json(
      { message: "Failed to delete link" },
      { status: 500 }
    );
  }
}
