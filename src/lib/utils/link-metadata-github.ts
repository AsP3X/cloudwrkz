import type { LinkMetadata } from "@/lib/utils/link-metadata";
import { extractMetadataFromHtml, extractFaviconFromUrl } from "@/lib/utils/link-metadata";
import { parseGitHubUrl } from "@/lib/utils/links";

/**
 * Fetch and extract metadata for GitHub repository / file pages.
 *
 * We intentionally keep this in a separate module so we can later
 * augment it with GitHub API data (stars, forks, etc.) without
 * bloating the generic link metadata extractor.
 */
export async function extractGitHubMetadata(url: string): Promise<LinkMetadata | null> {
  try {
    let fetchUrl = url.trim();
    if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
      fetchUrl = `https://${fetchUrl}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const html = await response.text();

      // Reuse the generic HTML metadata extraction so we get OG/Twitter/meta
      // handling and sanitization, but override a few GitHub-specific fields.
      const base = extractMetadataFromHtml(html, response.url || fetchUrl);

      const favicon =
        base.favicon || extractFaviconFromUrl(response.url || fetchUrl, html);

      // Start with HTML-based metadata
      const result: LinkMetadata = {
        ...base,
        ogSiteName: base.ogSiteName || "GitHub",
        favicon,
      };

      // Enrich with GitHub repository data using the GitHub API, keeping this
      // logic isolated in this module so it only ever runs for GitHub links.
      const parsed = parseGitHubUrl(response.url || fetchUrl);
      if (parsed && parsed.owner && parsed.repo) {
        result.githubOwner = parsed.owner;
        result.githubRepo = parsed.repo;

        const repoApiUrl = `https://api.github.com/repos/${encodeURIComponent(
          parsed.owner
        )}/${encodeURIComponent(parsed.repo)}`;

        const apiController = new AbortController();
        const apiTimeoutId = setTimeout(() => apiController.abort(), 5000);

        try {
          // 1) Core repository information
          const repoRes = await fetch(repoApiUrl, {
            signal: apiController.signal,
            headers: {
              Accept: "application/vnd.github+json",
              "User-Agent":
                "Cloudwrkz Link Metadata Bot (metadata enrichment for saved links)",
            },
          });

          if (repoRes.ok) {
            const repoJson: any = await repoRes.json().catch(() => null);
            if (repoJson && typeof repoJson === "object") {
              result.githubOwner = repoJson.owner?.login ?? parsed.owner;
              result.githubRepo = repoJson.name ?? parsed.repo;
              result.githubDefaultBranch = repoJson.default_branch;
              result.githubStars =
                typeof repoJson.stargazers_count === "number"
                  ? repoJson.stargazers_count
                  : undefined;
              result.githubForks =
                typeof repoJson.forks_count === "number"
                  ? repoJson.forks_count
                  : undefined;
              result.githubWatchers =
                typeof repoJson.subscribers_count === "number"
                  ? repoJson.subscribers_count
                  : typeof repoJson.watchers_count === "number"
                  ? repoJson.watchers_count
                  : undefined;
              result.githubOpenIssues =
                typeof repoJson.open_issues_count === "number"
                  ? repoJson.open_issues_count
                  : undefined;
              result.githubIsFork = !!repoJson.fork;
              if (repoJson.license) {
                result.githubLicense =
                  repoJson.license?.spdx_id ||
                  repoJson.license?.name ||
                  undefined;
              }
              result.githubPrimaryLanguage = repoJson.language || undefined;
              if (Array.isArray(repoJson.topics)) {
                result.githubTopics = repoJson.topics.filter(
                  (t: unknown) => typeof t === "string" && t.trim().length > 0
                );
              }
              if (typeof repoJson.pushed_at === "string") {
                result.githubLastPushedAt = repoJson.pushed_at;
              }
            }

            // 2) Branches (names + approximate count)
            const defaultBranch: string | undefined = repoJson?.default_branch;

            const [branchesRes, releasesRes, commitsRes] =
              await Promise.allSettled([
                fetch(`${repoApiUrl}/branches?per_page=10`, {
                  signal: apiController.signal,
                  headers: {
                    Accept: "application/vnd.github+json",
                    "User-Agent":
                      "Cloudwrkz Link Metadata Bot (metadata enrichment for saved links)",
                  },
                }),
                fetch(`${repoApiUrl}/releases?per_page=1`, {
                  signal: apiController.signal,
                  headers: {
                    Accept: "application/vnd.github+json",
                    "User-Agent":
                      "Cloudwrkz Link Metadata Bot (metadata enrichment for saved links)",
                  },
                }),
                defaultBranch
                  ? fetch(
                      `${repoApiUrl}/commits?per_page=1&sha=${encodeURIComponent(
                        defaultBranch
                      )}`,
                      {
                        signal: apiController.signal,
                        headers: {
                          Accept: "application/vnd.github+json",
                          "User-Agent":
                            "Cloudwrkz Link Metadata Bot (metadata enrichment for saved links)",
                        },
                      }
                    )
                  : Promise.resolve(null),
              ]);

            // Branches: up to 10 names + total count from Link header where possible
            if (
              branchesRes.status === "fulfilled" &&
              branchesRes.value &&
              (branchesRes.value as Response).ok
            ) {
              const res = branchesRes.value as Response;
              const branchesJson: any = await res.json().catch(() => null);
              if (Array.isArray(branchesJson)) {
                result.githubBranches = branchesJson
                  .map((b: any) =>
                    typeof b?.name === "string" ? b.name : null
                  )
                  .filter((name: string | null) => !!name) as string[];
              }
              const linkHeader = res.headers.get("link");
              if (linkHeader) {
                const match = linkHeader.match(/&page=(\d+)>; rel="last"/);
                if (match) {
                  const total = Number(match[1]);
                  if (!isNaN(total) && total > 0) {
                    result.githubBranchesCount = total;
                  }
                }
              } else if (Array.isArray(branchesJson)) {
                result.githubBranchesCount = branchesJson.length;
              }
            }

            // Releases: approximate count from Link header or array length
            if (
              releasesRes.status === "fulfilled" &&
              releasesRes.value &&
              (releasesRes.value as Response).ok
            ) {
              const res = releasesRes.value as Response;
              const releasesJson: any = await res.json().catch(() => null);
              const linkHeader = res.headers.get("link");
              if (linkHeader) {
                const match = linkHeader.match(/&page=(\d+)>; rel="last"/);
                if (match) {
                  const total = Number(match[1]);
                  if (!isNaN(total) && total > 0) {
                    result.githubReleasesCount = total;
                  }
                }
              } else if (Array.isArray(releasesJson)) {
                result.githubReleasesCount = releasesJson.length;
              }
            }

            // Commits: approximate count for the default branch via Link header
            if (
              commitsRes?.status === "fulfilled" &&
              commitsRes.value &&
              (commitsRes.value as Response).ok
            ) {
              const res = commitsRes.value as Response;
              const commitsJson: any = await res.json().catch(() => null);
              const linkHeader = res.headers.get("link");
              if (linkHeader) {
                const match = linkHeader.match(/&page=(\d+)>; rel="last"/);
                if (match) {
                  const total = Number(match[1]);
                  if (!isNaN(total) && total > 0) {
                    result.githubCommitsCount = total;
                  }
                }
              } else if (Array.isArray(commitsJson)) {
                result.githubCommitsCount = commitsJson.length;
              }
            }
          }

          clearTimeout(apiTimeoutId);
        } catch {
          clearTimeout(apiTimeoutId);
          // Swallow API errors so basic metadata still works
        }
      }

      return result;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  } catch {
    return null;
  }
}

// (No longer using regex-based number extraction here; all enrichment comes
// from the GitHub API so the logic is more robust across layout changes.)

