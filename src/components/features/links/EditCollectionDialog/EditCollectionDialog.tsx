"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { updateCollection } from "@/server/actions/collections";

interface EditCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
  };
}

export function EditCollectionDialog({
  open,
  onOpenChange,
  collection,
}: EditCollectionDialogProps) {
  const router = useRouter();
  const [name, setName] = React.useState(collection.name);
  const [description, setDescription] = React.useState(collection.description || "");
  const [color, setColor] = React.useState(collection.color || "");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (collection) {
      setName(collection.name);
      setDescription(collection.description || "");
      setColor(collection.color || "");
    }
  }, [collection]);

  React.useEffect(() => {
    if (!open) {
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Collection name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await updateCollection(collection.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        color: color.trim() || undefined,
      });

      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to update collection");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Collection"
      description="Update collection information"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-md">
            <p className="text-sm text-error-800 dark:text-error-200">{error}</p>
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Name <span className="text-error-600">*</span>
          </label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Collection"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Description
          </label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            rows={3}
          />
        </div>

        <div>
          <label htmlFor="color" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Color (Hex)
          </label>
          <div className="flex gap-2">
            <Input
              id="color"
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#3B82F6"
              pattern="^#[0-9A-Fa-f]{6}$"
            />
            {color && (
              <div
                className="w-10 h-10 rounded border border-neutral-200 dark:border-neutral-700"
                style={{ backgroundColor: color }}
              />
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Optional: Enter a hex color code (e.g., #3B82F6)
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Updating..." : "Update Collection"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
