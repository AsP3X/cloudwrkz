/**
 * Check if a URL is a YouTube link
 */
export function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return /(youtube\.com|youtu\.be)/i.test(lowerUrl);
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  try {
    const youtuBeMatch = url.match(/(?:youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (youtuBeMatch) {
      return youtuBeMatch[1];
    }

    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get("v");
    if (videoId) {
      return videoId;
    }

    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      return embedMatch[1];
    }

    const vMatch = url.match(/youtube\.com\/v\/([a-zA-Z0-9_-]{11})/);
    if (vMatch) {
      return vMatch[1];
    }

    return null;
  } catch {
    const regexMatch = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
    );
    return regexMatch ? regexMatch[1] : null;
  }
}

/**
 * Check if a URL is a GitHub repository or file page
 */
export function isGitHubUrl(url: string): boolean {
  if (!url) return false;
  try {
    const normalized = url.trim();
    const withProtocol =
      normalized.startsWith("http://") || normalized.startsWith("https://")
        ? normalized
        : `https://${normalized}`;
    const u = new URL(withProtocol);
    return u.hostname.toLowerCase() === "github.com";
  } catch {
    return /github\.com/i.test(url);
  }
}

/** Parsed GitHub URL for repo root, tree, blob, issues, pulls, etc. */
export interface GitHubParsedUrl {
  owner: string;
  repo: string;
  path?: string;
  branch?: string;
  type:
    | "repo"
    | "tree"
    | "blob"
    | "pull"
    | "issue"
    | "issues"
    | "pulls"
    | "actions"
    | "releases"
    | "commits"
    | "wiki"
    | "projects"
    | "security"
    | "profile"
    | "other";
  baseUrl: string;
  /** Full URL to the repo root (https://github.com/owner/repo) */
  repoUrl: string;
}

/**
 * Parse a GitHub URL into owner, repo, path, branch, and type.
 * Returns null if the URL is not a valid github.com URL or has no owner/repo.
 */
export function parseGitHubUrl(url: string): GitHubParsedUrl | null {
  if (!url || !isGitHubUrl(url)) return null;
  try {
    const normalized = url.trim();
    const withProtocol =
      normalized.startsWith("http://") || normalized.startsWith("https://")
        ? normalized
        : `https://${normalized}`;
    const u = new URL(withProtocol);
    if (u.hostname.toLowerCase() !== "github.com") return null;

    const pathParts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (pathParts.length < 2) {
      return {
        owner: pathParts[0] || "",
        repo: "",
        type: "profile",
        baseUrl: u.origin + "/" + pathParts[0],
        repoUrl: u.origin + "/" + pathParts[0],
      };
    }

    const owner = pathParts[0];
    const repo = pathParts[1];
    const repoUrl = `${u.origin}/${owner}/${repo}`;

    if (pathParts.length === 2) {
      return { owner, repo, type: "repo", baseUrl: u.origin, repoUrl };
    }

    const segment = pathParts[2];
    switch (segment) {
      case "tree":
        return {
          owner,
          repo,
          branch: pathParts[3],
          path: pathParts.slice(4).join("/"),
          type: "tree",
          baseUrl: u.origin,
          repoUrl,
        };
      case "blob":
        return {
          owner,
          repo,
          branch: pathParts[3],
          path: pathParts.slice(4).join("/"),
          type: "blob",
          baseUrl: u.origin,
          repoUrl,
        };
      case "pull":
        return {
          owner,
          repo,
          path: pathParts[3],
          type: pathParts.length > 3 ? "pull" : "pulls",
          baseUrl: u.origin,
          repoUrl,
        };
      case "issues":
        return {
          owner,
          repo,
          path: pathParts[3],
          type: pathParts.length > 3 ? "issue" : "issues",
          baseUrl: u.origin,
          repoUrl,
        };
      case "commit":
      case "commits":
        return {
          owner,
          repo,
          branch: pathParts[3],
          type: "commits",
          baseUrl: u.origin,
          repoUrl,
        };
      case "actions":
        return { owner, repo, type: "actions", baseUrl: u.origin, repoUrl };
      case "releases":
        return { owner, repo, type: "releases", baseUrl: u.origin, repoUrl };
      case "wiki":
        return { owner, repo, type: "wiki", baseUrl: u.origin, repoUrl };
      case "projects":
        return { owner, repo, type: "projects", baseUrl: u.origin, repoUrl };
      case "security":
        return { owner, repo, type: "security", baseUrl: u.origin, repoUrl };
      default:
        return { owner, repo, type: "other", baseUrl: u.origin, repoUrl };
    }
  } catch {
    return null;
  }
}

/**
 * Extract domain from URL (hostname without leading www.)
 */
export function extractDomain(url: string): string {
  try {
    let urlToParse = url;
    if (!urlToParse.startsWith("http://") && !urlToParse.startsWith("https://")) {
      urlToParse = `https://${urlToParse}`;
    }
    const urlObj = new URL(urlToParse);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url.split("/")[0].replace(/^www\./, "");
  }
}
