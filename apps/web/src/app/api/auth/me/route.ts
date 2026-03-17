import { NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS, type ModuleKey } from "@/lib/constants/modules";

/** Module keys returned to clients (e.g. iOS). Backend uses "timetracking", client expects "time_tracking". */
const MODULE_KEY_TO_CLIENT_ID: Record<ModuleKey, string> = {
  [MODULE_KEYS.TICKETS]: "tickets",
  [MODULE_KEYS.TIMETRACKING]: "time_tracking",
  [MODULE_KEYS.TODOS]: "todos",
  [MODULE_KEYS.LINKS]: "links",
};

/**
 * GET /api/auth/me
 * Authorization: Bearer <session token>
 * Returns 200 { name, email, modules? } for the current user.
 * modules: string[] — module IDs the user can access (e.g. ["tickets", "todos", "links", "time_tracking", "archive"]).
 * Used by the iOS app to populate profile and filter dashboard menu by permission.
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const modules: string[] = [];
  for (const [moduleKey, clientId] of Object.entries(MODULE_KEY_TO_CLIENT_ID)) {
    if ((await canUserViewModule(user.id, moduleKey as ModuleKey)) && clientId) {
      modules.push(clientId);
    }
  }
  // Archive: allow if user can view tickets or links (archive is a view over those).
  if (modules.includes("tickets") || modules.includes("links")) {
    modules.push("archive");
  }

  return NextResponse.json(
    { name: user.name, email: user.email, modules },
    { status: 200 }
  );
}
