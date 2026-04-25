// Human: This barrel file re-exports local modules from the `LinkDetailLayout` folder so callers can import them through one path while working on saved links and collections.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; RE-EXPORTS ; NO runtime logic in this file.
export {
  LinkDetailLayout,
  LinkDetailSidebarProvider,
  useLinkDetailSidebar,
} from "./LinkDetailLayout";
