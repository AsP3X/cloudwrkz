/** Inline SVG icon for time tracking in the sidebar. */
// Human: Tiny inline SVG so nav labels never depend on external icon fonts and stay tree-shakeable.
// Agent: RENDERS only static path SVGs; NO props; NO side effects.

export const IconMyTime = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);
