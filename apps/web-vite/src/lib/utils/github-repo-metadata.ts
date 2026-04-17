/**
 * Maps stored link `metadata` (populated by the API GitHub metadata worker) to display fields.
 */

export interface GitHubRepoDisplayMetadata {
  githubStars?: number;
  githubForks?: number;
  githubWatchers?: number;
  githubOpenIssues?: number;
  githubCommitsCount?: number;
  githubBranchesCount?: number;
  githubReleasesCount?: number;
  githubBranches?: string[];
  githubTopics?: string[];
  githubPrimaryLanguage?: string;
  githubDefaultBranch?: string;
  githubLicense?: string;
  githubLastPushedAt?: string;
  githubOwner?: string;
  githubRepo?: string;
}

/** Normalize stored metadata keys (camelCase github* only). */
export function pickGithubMetadataFromRecord(
  metadata: Record<string, unknown> | null | undefined,
): GitHubRepoDisplayMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const m = metadata;
  const num = (k: string): number | undefined => (typeof m[k] === "number" ? (m[k] as number) : undefined);
  const str = (k: string): string | undefined => (typeof m[k] === "string" ? (m[k] as string) : undefined);
  const arr = (k: string): string[] | undefined => {
    if (!Array.isArray(m[k])) return undefined;
    const a = (m[k] as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    return a.length > 0 ? a : undefined;
  };

  return {
    githubOwner: str("githubOwner"),
    githubRepo: str("githubRepo"),
    githubStars: num("githubStars"),
    githubForks: num("githubForks"),
    githubWatchers: num("githubWatchers"),
    githubOpenIssues: num("githubOpenIssues"),
    githubCommitsCount: num("githubCommitsCount"),
    githubBranchesCount: num("githubBranchesCount"),
    githubReleasesCount: num("githubReleasesCount"),
    githubBranches: arr("githubBranches"),
    githubTopics: arr("githubTopics"),
    githubPrimaryLanguage: str("githubPrimaryLanguage"),
    githubDefaultBranch: str("githubDefaultBranch"),
    githubLicense: str("githubLicense"),
    githubLastPushedAt: str("githubLastPushedAt"),
  };
}
