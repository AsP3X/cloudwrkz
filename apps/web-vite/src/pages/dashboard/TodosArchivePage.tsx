import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/constants/routes";

// Human: Legacy todos archive entry point that forwards users into the unified archive view filtered to todos.
// Agent: useEffect navigate `${ROUTES.ARCHIVE}?type=todos` replace; RENDERS null; NO fetch.

// Human: Default export performs the client redirect so old bookmarks reach the consolidated archive screen.
// Agent: DEFAULT export; useNavigate; useEffect dependency [navigate]; RETURNS null.

export default function TodosArchivePage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`${ROUTES.ARCHIVE}?type=todos`, { replace: true });
  }, [navigate]);
  return null;
}
