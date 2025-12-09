/**
 * Utility functions for user-related operations
 * Updated: Deleted users now show as "Deleted User (Original name - short hash of email)"
 */

type UserWithStatus = {
  id?: string;
  name: string | null;
  email: string;
  status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "BANNED" | "DELETED";
};

/**
 * Formats a user's display name.
 * If user is null/undefined and a storedName is provided, returns the storedName (for deleted users).
 * If the user is deleted, returns "Deleted User (Original name - short hash of email)"
 * Otherwise returns the user's name or email fallback.
 */
export function formatUserName(
  user: UserWithStatus | null | undefined,
  storedName?: string | null
): string {
  // If user is null but we have a stored name (deleted user), use it
  if (!user && storedName) {
    return storedName;
  }
  
  // If user is null/undefined without stored name, return fallback
  if (!user) {
    return "Unknown User";
  }

  // Check if user is deleted - handle both explicit DELETED status and undefined status
  // If status is DELETED, format accordingly with original name and email hash
  if (user.status === "DELETED") {
    const originalName = user.name || user.email.split("@")[0];
    const emailHash = shortHash(user.email);
    return `Deleted User (${originalName} - ${emailHash})`;
  }
  // For non-deleted users, return name or email fallback
  return user.name || user.email.split("@")[0];
}

/**
 * Generates a short hash from a string (first 6 characters)
 * Uses a consistent hash function that works identically in both server and client
 * This prevents hydration mismatches in Next.js
 */
function shortHash(input: string): string {
  // Use a simple but effective hash function that works identically everywhere
  // This ensures server-side rendering and client-side hydration produce the same result
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex, ensure 6 characters, pad if needed
  const hexHash = Math.abs(hash).toString(16);
  return hexHash.substring(0, 6).padStart(6, '0');
}

/**
 * Formats a user's display name for use in initials/avatars.
 * Returns the first character of the formatted name.
 */
export function formatUserInitial(
  user: UserWithStatus | null | undefined,
  storedName?: string | null
): string {
  const displayName = formatUserName(user, storedName);
  return displayName[0].toUpperCase();
}
