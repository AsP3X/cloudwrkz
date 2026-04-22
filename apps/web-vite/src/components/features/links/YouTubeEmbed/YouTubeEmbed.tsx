import React from "react";
import { extractYouTubeVideoId, isYouTubeUrl } from "@/lib/utils/links";

// Human: React UI for `YouTubeEmbed` in saved links and collections: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; EXPORTS YouTubeEmbed; REACT component; READS props hooks; MAY CALL api client.
/**
 * Responsive YouTube iframe for link detail; memoized so parent re-renders do not reload the embed.
 */
export const YouTubeEmbed = React.memo(
  ({ url }: { url: string }) => {
    if (!isYouTubeUrl(url)) return null;
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) return null;

    return (
      <div
        className="relative w-full rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-soft-lg"
        style={{ paddingBottom: "56.25%" }}
      >
        <iframe
          className="absolute top-0 left-0 w-full h-full rounded-xl"
          src={`https://www.youtube.com/embed/${videoId}`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  },
  (prev, next) => prev.url === next.url
);

YouTubeEmbed.displayName = "YouTubeEmbed";
