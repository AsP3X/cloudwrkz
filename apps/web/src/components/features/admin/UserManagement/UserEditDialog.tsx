"use client";

import React, { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils/date";
import type { getAllUsersAdmin } from "@/server/actions/admin/users";
import { resetUserPasswordAdmin } from "@/server/actions/admin/users";
import { cn } from "@/lib/utils/cn";

type User = Awaited<ReturnType<typeof getAllUsersAdmin>>["users"][0];

interface UserEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onSubmit: (data: any) => Promise<any>;
  isLoading: boolean;
}

function FieldGroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{children}</h3>
  );
}

export function UserEditDialog({ open, onOpenChange, user, onSubmit, isLoading }: UserEditDialogProps) {
  const [formData, setFormData] = useState({
    email: user.email,
    name: user.name || "",
    password: "",
    role: user.role as "USER" | "AGENT" | "ADMIN" | "MODERATOR",
    status: user.status as "ACTIVE" | "PENDING" | "SUSPENDED" | "BANNED" | "DELETED",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [oneTimePassword, setOneTimePassword] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [showManualPassword, setShowManualPassword] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setFormData({
        email: user.email,
        name: user.name || "",
        password: "",
        role: user.role as any,
        status: user.status as any,
      });
      setError(null);
      setFieldErrors({});
      setOneTimePassword(null);
      setCopyHint(null);
      setShowManualPassword(false);
    } else {
      setOneTimePassword(null);
      setCopyHint(null);
    }
    onOpenChange(newOpen);
  };

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

    try {
      const result = await onSubmit(updateData);
      if (!result?.success) {
        setError(result?.error ?? "Could not save changes");
        if (result?.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        return;
      }
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleGeneratePassword = async () => {
    setError(null);
    setCopyHint(null);
    setResetLoading(true);
    try {
      const result = await resetUserPasswordAdmin(user.id);
      if (result.success && result.data) {
        setOneTimePassword(result.data.plainPassword);
        setFormData((fd) => ({ ...fd, password: "" }));
      } else {
        setError(result.success ? "Unexpected response" : result.error);
      }
    } finally {
      setResetLoading(false);
    }
  };

  const copyPassword = async () => {
    if (!oneTimePassword) return;
    try {
      await navigator.clipboard.writeText(oneTimePassword);
      setCopyHint("Copied to clipboard");
    } catch {
      setCopyHint("Could not copy — select the password and copy manually");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Edit user"
      description={user.email}
      className="max-w-lg sm:max-w-lg"
    >
      <form onSubmit={handleSubmit} className="px-6 pb-6 pt-1">
        <div className="space-y-8">
          {error && (
            <div className="p-3 rounded-lg bg-error-50 dark:bg-error-950/80 border border-error-200/80 dark:border-error-800/80 text-error-700 dark:text-error-300 text-sm">
              {error}
            </div>
          )}

          <section className="space-y-4" aria-labelledby="edit-user-account">
            <div id="edit-user-account">
              <FieldGroupTitle>Account</FieldGroupTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Identity and display name
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  error={fieldErrors.email?.[0]}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  error={fieldErrors.name?.[0]}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 pt-2 border-t border-neutral-200 dark:border-neutral-800" aria-labelledby="edit-user-access">
            <div id="edit-user-access">
              <FieldGroupTitle>Role &amp; status</FieldGroupTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                What they can do and whether they can sign in
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
                  { value: "BANNED", label: "Banned" },
                  { value: "DELETED", label: "Deleted" },
                ]}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                error={fieldErrors.status?.[0]}
              />
            </div>
          </section>

          <section className="space-y-4 pt-2 border-t border-neutral-200 dark:border-neutral-800" aria-labelledby="edit-user-password">
            <div id="edit-user-password">
              <FieldGroupTitle>Password</FieldGroupTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Random reset signs the user out everywhere. Copy the new password before you close — it is not shown again.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto sm:self-start"
                loading={resetLoading}
                disabled={resetLoading || isLoading}
                onClick={handleGeneratePassword}
              >
                Generate new password
              </Button>

              {oneTimePassword && (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-3 space-y-2",
                    "border-amber-200/90 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/25"
                  )}
                  role="status"
                >
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200/90">
                    Copy now — won&apos;t be shown again
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
                    <code className="flex-1 min-w-0 break-all rounded-md bg-white/70 dark:bg-neutral-950/50 px-2.5 py-2 text-xs sm:text-sm font-mono text-neutral-900 dark:text-neutral-100 border border-amber-200/60 dark:border-amber-900/50">
                      {oneTimePassword}
                    </code>
                    <Button type="button" variant="primary" size="sm" onClick={copyPassword} className="shrink-0 sm:self-center">
                      Copy
                    </Button>
                  </div>
                  {copyHint && <p className="text-xs text-amber-800/90 dark:text-amber-200/80">{copyHint}</p>}
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 underline-offset-2 hover:underline"
                  onClick={() => setShowManualPassword((v) => !v)}
                >
                  {showManualPassword ? "Hide custom password" : "Set a custom password instead"}
                </button>
              </div>

              {showManualPassword && (
                <Input
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  error={fieldErrors.password?.[0]}
                  helperText="Applied when you save. Leave empty to keep the current password."
                />
              )}
            </div>
          </section>

          {user.status === "BANNED" && (user as any).banReason && (
            <div className="rounded-lg border border-error-200/80 dark:border-error-800/80 bg-error-50/50 dark:bg-error-950/30 px-3 py-3 space-y-2">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">Ban details</p>
              {(user as any).banReason && (
                <p className="text-sm text-error-700 dark:text-error-300">{(user as any).banReason}</p>
              )}
              {(user as any).bannedAt && (
                <p className="text-xs text-error-600 dark:text-error-400">
                  {formatDateTime((user as any).bannedAt)}
                </p>
              )}
              <p className="text-xs text-error-600/90 dark:text-error-400/90">
                Set status to Active to unban.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading || resetLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={resetLoading}>
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
