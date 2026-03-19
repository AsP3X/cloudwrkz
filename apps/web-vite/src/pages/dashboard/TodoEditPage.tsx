import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/constants/routes";

/**
 * Redirects to task detail with edit mode (matches Next.js behavior).
 */
export default function TodoEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`${ROUTES.DASHBOARD}/todos/${id}?mode=edit`, { replace: true });
  }, [navigate, id]);
  return null;
}
