"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import type { getAllUsersAdmin } from "@/server/actions/admin/users";

type User = Awaited<ReturnType<typeof getAllUsersAdmin>>["users"][0];

interface UserEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onSubmit: (data: any) => Promise<any>;
  isLoading: boolean;
}

export function UserEditDialog({ open, onOpenChange, user, onSubmit, isLoading }: UserEditDialogProps) {
  const [formData, setFormData] = useState({
    email: user.email,
    name: user.name || "",
    password: "",
    role: user.role as "USER" | "AGENT" | "ADMIN" | "MODERATOR",
    status: user.status as "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open) {
      setFormData({
        email: user.email,
        name: user.name || "",
        password: "",
        role: user.role as any,
        status: user.status as any,
      });
      setError(null);
      setFieldErrors({});
    }
  }, [open, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const updateData: any = {
      email: formData.email,
      name: formData.name || null,
      role: formData.role,
      status: formData.status,
    };

    if (formData.password) {
      updateData.password = formData.password;
    }

    const result = await onSubmit(updateData);
    
    if (!result.success) {
      setError(result.error);
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit User"
      description={`Edit user: ${user.email}`}
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300 text-sm">
            {error}
          </div>
        )}

        <Input
          label="Email"
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          error={fieldErrors.email?.[0]}
        />

        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={fieldErrors.name?.[0]}
        />

        <Input
          label="Password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          error={fieldErrors.password?.[0]}
          helperText="Leave blank to keep current password"
        />

        <Select
          label="Role"
          required
          options={[
            { value: "USER", label: "User" },
            { value: "AGENT", label: "Agent" },
            { value: "MODERATOR", label: "Moderator" },
            { value: "ADMIN", label: "Admin" },
          ]}
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
          error={fieldErrors.role?.[0]}
        />

        <Select
          label="Status"
          required
          options={[
            { value: "ACTIVE", label: "Active" },
            { value: "PENDING", label: "Pending" },
            { value: "SUSPENDED", label: "Suspended" },
            { value: "DELETED", label: "Deleted" },
          ]}
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
          error={fieldErrors.status?.[0]}
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading}>
            Save Changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
