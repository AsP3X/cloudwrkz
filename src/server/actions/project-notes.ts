"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { canEditProject } from "./projects";
import { revalidatePath } from "next/cache";

export type ProjectNoteInput = {
  title?: string;
  content: string;
  isPinned?: boolean;
};

export type ProjectNoteUpdateInput = Partial<ProjectNoteInput>;

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createProjectNote(
  projectId: string,
  input: ProjectNoteInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuth();

    if (!(await canEditProject(user.id, projectId))) {
      return {
        success: false,
        error: "You don't have permission to create notes for this project",
      };
    }

    if (!input.content || input.content.trim().length === 0) {
      return {
        success: false,
        error: "Note content is required",
        fieldErrors: { content: ["Note content cannot be empty"] },
      };
    }

    const note = await prisma.projectNote.create({
      data: {
        projectId,
        title: input.title?.trim(),
        content: input.content.trim(),
        authorId: user.id,
        isPinned: input.isPinned || false,
      },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);

    return {
      success: true,
      data: { id: note.id },
      message: "Note created successfully",
    };
  } catch (error) {
    console.error("Error creating project note:", error);
    return {
      success: false,
      error: "Failed to create note. Please try again.",
    };
  }
}

export async function updateProjectNote(
  noteId: string,
  input: ProjectNoteUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const note = await prisma.projectNote.findUnique({
      where: { id: noteId },
      select: { projectId: true, authorId: true },
    });

    if (!note) {
      return {
        success: false,
        error: "Note not found",
      };
    }

    // Only author or project manager can edit
    if (note.authorId !== user.id && !(await canEditProject(user.id, note.projectId))) {
      return {
        success: false,
        error: "You don't have permission to update this note",
      };
    }

    if (input.content !== undefined && input.content.trim().length === 0) {
      return {
        success: false,
        error: "Note content cannot be empty",
        fieldErrors: { content: ["Note content cannot be empty"] },
      };
    }

    const updateData: any = {};
    if (input.title !== undefined) updateData.title = input.title?.trim();
    if (input.content !== undefined) updateData.content = input.content.trim();
    if (input.isPinned !== undefined) updateData.isPinned = input.isPinned;

    await prisma.projectNote.update({
      where: { id: noteId },
      data: updateData,
    });

    revalidatePath(`/dashboard/projects/${note.projectId}`);

    return {
      success: true,
      message: "Note updated successfully",
    };
  } catch (error) {
    console.error("Error updating project note:", error);
    return {
      success: false,
      error: "Failed to update note. Please try again.",
    };
  }
}

export async function deleteProjectNote(noteId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const note = await prisma.projectNote.findUnique({
      where: { id: noteId },
      select: { projectId: true, authorId: true },
    });

    if (!note) {
      return {
        success: false,
        error: "Note not found",
      };
    }

    // Only author or project manager can delete
    if (note.authorId !== user.id && !(await canEditProject(user.id, note.projectId))) {
      return {
        success: false,
        error: "You don't have permission to delete this note",
      };
    }

    await prisma.projectNote.delete({
      where: { id: noteId },
    });

    revalidatePath(`/dashboard/projects/${note.projectId}`);

    return {
      success: true,
      message: "Note deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting project note:", error);
    return {
      success: false,
      error: "Failed to delete note. Please try again.",
    };
  }
}

export async function getProjectNotes(projectId: string) {
  const user = await requireAuth();

  const { canViewProject } = await import("./projects");
  if (!(await canViewProject(user.id, projectId))) {
    return [];
  }

  return prisma.projectNote.findMany({
    where: { projectId },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [
      { isPinned: "desc" },
      { createdAt: "desc" },
    ],
  });
}
