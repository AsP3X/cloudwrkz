"use client";

import React, { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createUserAdmin } from "@/server/actions/admin/users";

interface UserCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => Promise<any>;
  isLoading: boolean;
}

export function UserCreateDialog({ open, onOpenChange, onSubmit, isLoading }: UserCreateDialogProps) {
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    role: "USER" as "USER" | "AGENT" | "ADMIN" | "MODERATOR",
    status: "PENDING" as "ACTIVE" | "PENDING" | "SUSPENDED",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const result = await onSubmit(formData);
    
    if (!result.success) {
      setError(result.error);
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
    } else {
      setFormData({
        email: "",
        name: "",
        password: "",
        role: "USER",
        status: "PENDING",
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create User"
      description="Create a new user account"
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
          required
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          error={fieldErrors.password?.[0]}
          helperText="Must be at least 8 characters"
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
            { value: "PENDING", label: "Pending" },
            { value: "ACTIVE", label: "Active" },
            { value: "SUSPENDED", label: "Suspended" },
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
            Create User
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
