import { redirect } from "next/navigation";

interface TodoEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function TodoEditPage({ params }: TodoEditPageProps) {
  const { id } = await params;
  redirect(`/dashboard/todos/${id}?mode=edit`);
}
