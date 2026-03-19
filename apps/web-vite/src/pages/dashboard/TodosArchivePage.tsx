import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/constants/routes";

export default function TodosArchivePage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`${ROUTES.ARCHIVE}?type=todos`, { replace: true });
  }, [navigate]);
  return null;
}
