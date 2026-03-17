"use server";

import { archiveLink, unarchiveLink } from "@/server/actions/links";
import { revalidatePath } from "next/cache";

export async function handleArchiveLink(formData: FormData) {
  const linkId = formData.get("linkId") as string;
  if (!linkId) return;
  
  const result = await archiveLink(linkId);
  if (result.success) {
    revalidatePath(`/dashboard/links/${linkId}`);
    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/links/archive");
  }
}

export async function handleUnarchiveLink(formData: FormData) {
  const linkId = formData.get("linkId") as string;
  if (!linkId) return;
  
  const result = await unarchiveLink(linkId);
  if (result.success) {
    revalidatePath(`/dashboard/links/${linkId}`);
    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/links/archive");
  }
}
