import { LinkViewToggle } from "../LinkViewToggle";
import { useLinkView } from "../LinkViewContext";

// Human: React UI for `LinkViewControls` in saved links and collections: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; EXPORTS LinkViewControls; REACT component; READS props hooks; MAY CALL api client.
export const LinkViewControls = () => {
  const { viewMode, setViewMode } = useLinkView();

  return (
    <div>
      <LinkViewToggle currentView={viewMode} onViewChange={setViewMode} />
    </div>
  );
};
