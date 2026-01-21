import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";

// Force dynamic rendering to keep permissions in sync
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TodosArchivePage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    redirect(ROUTES.LOGIN);
  }

  redirect(`${ROUTES.ARCHIVE}?type=todos`);
}

