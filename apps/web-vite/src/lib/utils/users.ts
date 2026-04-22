// Human: Display helpers for user names, avatar initials, and mapping stored avatar paths to same-origin fetch URLs.
// Agent: formatUserName HANDLES DELETED hash mask; getAvatarUrl BUILDS /api/profile/avatar path; READS UserLike union.

type UserWithStatus = {
  id?: string;
  name: string | null;
  email: string;
  status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "BANNED" | "DELETED";
};

/** Accepts UserSummary (from API) or UserWithStatus - both have name, email, status */
type UserLike = UserWithStatus | { id?: string; name: string | null; email: string; status?: string };

export function formatUserName(
  user: UserLike | null | undefined,
  storedName?: string | null
): string {
  if (!user && storedName) return storedName;
  if (!user) return "Unknown User";
  if (user.status === "DELETED") {
    const originalName = user.name || user.email.split("@")[0];
    let hash = 0;
    for (let i = 0; i < user.email.length; i++) {
      hash = ((hash << 5) - hash) + user.email.charCodeAt(i);
      hash = hash & hash;
    }
    const hexHash = Math.abs(hash).toString(16).substring(0, 6).padStart(6, "0");
    return `Deleted User (${originalName} - ${hexHash})`;
  }
  return user.name || user.email.split("@")[0];
}

/** First character of display name (for avatar initial). */
export function formatUserInitial(
  user: UserLike | null | undefined,
  storedName?: string | null
): string {
  const displayName = formatUserName(user, storedName);
  return displayName[0]?.toUpperCase() ?? "?";
}

/**
 * Returns the URL to use for displaying an avatar stored in the DB.
 * Avatar is stored as path like /uploads/avatars/userId-timestamp.jpg.
 * We serve it via GET /api/profile/avatar/[filename] so it works in standalone deployments.
 */
export function getAvatarUrl(avatarPath: string | null | undefined): string | null {
  if (!avatarPath || typeof avatarPath !== "string") return null;
  const filename = avatarPath.split("/").pop();
  if (!filename) return null;
  return `/api/profile/avatar/${encodeURIComponent(filename)}`;
}
