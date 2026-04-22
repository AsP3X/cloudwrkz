import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/constants/routes";

// Human: Compatibility route that forwards legacy todo edit URLs to the unified task detail page in edit mode.
// Agent: useEffect navigate `${ROUTES.DASHBOARD}/todos/${id}?mode=edit` replace true; RENDERS null; NO UI.

/**
 * Redirects to task detail with edit mode (matches Next.js behavior).
 */
// Human: Exported route component that performs the redirect side effect and renders nothing visible.
// Agent: DEFAULT export; useParams id; useNavigate replace navigation; RETURNS null.

export default function TodoEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`${ROUTES.DASHBOARD}/todos/${id}?mode=edit`, { replace: true });
  }, [navigate, id]);
  return null;
}
