import { redirect } from "next/navigation";

interface TaskEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskEditPage({ params }: TaskEditPageProps) {
  const { id } = await params;
  redirect(`/dashboard/tasks/${id}?mode=edit`);
}
