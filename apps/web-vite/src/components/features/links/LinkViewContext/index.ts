// Human: This barrel file re-exports LinkViewProvider, useLinkView, type from the `LinkViewContext` folder so callers can import them through one path while working on saved links and collections.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; RE-EXPORTS LinkViewProvider, useLinkView, type; NO runtime logic in this file.
export { LinkViewProvider, useLinkView, type LinkViewMode } from "./LinkViewContext";
