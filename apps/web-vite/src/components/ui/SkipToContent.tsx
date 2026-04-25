// Human: Accessibility skip link that briefly blurs after mount so focus-visible styles do not stick on full page load.
// Agent: READS linkRef; CALLS blur and body focus dance in rAF + timeout; LINKS to #main-content.
import { useEffect, useRef } from "react";

export const SkipToContent = () => {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const blurIfFocused = () => {
      if (
        linkRef.current &&
        typeof document !== "undefined" &&
        document.activeElement === linkRef.current
      ) {
        linkRef.current.blur();
        if (document.body) {
          document.body.focus();
          document.body.blur();
        }
      }
    };

    requestAnimationFrame(() => {
      blurIfFocused();
    });

    const timer = setTimeout(blurIfFocused, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <a
      ref={linkRef}
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
    >
      Skip to main content
    </a>
  );
};
