"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { updateGroupPermissions } from "@/server/actions/groups";
import { getPermissions, getPermissionCategories, getGroupPermissions } from "@/server/actions/permissions";
import type { Permission } from "@prisma/client";

interface GroupPermissionsManagerProps {
  groupId: string;
  initialPermissionIds?: string[];
  onSave?: () => void;
  onCancel?: () => void;
}

export function GroupPermissionsManager({
  groupId,
  initialPermissionIds = [],
  onSave,
  onCancel,
}: GroupPermissionsManagerProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(
    new Set(initialPermissionIds)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load permissions and categories
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const [perms, cats, groupPerms] = await Promise.all([
          getPermissions(),
          getPermissionCategories(),
          getGroupPermissions(groupId),
        ]);
        setPermissions(perms);
        setCategories(cats);
        setSelectedPermissionIds(new Set(groupPerms.map((p) => p.id)));
        // All categories collapsed by default
        setExpandedCategories(new Set());
      } catch (err: any) {
        setError(err.message || "Failed to load permissions");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [groupId]);

  // Filter permissions by search query
  const filteredPermissions = useMemo(() => {
    if (!searchQuery.trim()) {
      return permissions;
    }
    const query = searchQuery.toLowerCase();
    return permissions.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.key.toLowerCase().includes(query)
    );
  }, [permissions, searchQuery]);

  // Group permissions by category
  const permissionsByCategory = useMemo(() => {
    const grouped: Record<string, Permission[]> = {};
    for (const perm of filteredPermissions) {
      if (!grouped[perm.category]) {
        grouped[perm.category] = [];
      }
      grouped[perm.category].push(perm);
    }
    return grouped;
  }, [filteredPermissions]);

  // Get selected count for category
  const getCategorySelectedCount = (category: string) => {
    const categoryPerms = permissionsByCategory[category] || [];
    return categoryPerms.filter((p) => selectedPermissionIds.has(p.id)).length;
  };

  // Toggle permission selection
  const togglePermission = (permissionId: string) => {
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  };

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Select all in category
  const selectAllInCategory = (category: string) => {
    const categoryPerms = permissionsByCategory[category] || [];
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev);
      categoryPerms.forEach((p) => next.add(p.id));
      return next;
    });
  };

  // Deselect all in category
  const deselectAllInCategory = (category: string) => {
    const categoryPerms = permissionsByCategory[category] || [];
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev);
      categoryPerms.forEach((p) => next.delete(p.id));
      return next;
    });
  };

  // Select all
  const selectAll = () => {
    setSelectedPermissionIds(new Set(permissions.map((p) => p.id)));
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedPermissionIds(new Set());
  };

  // Handle save
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const result = await updateGroupPermissions(groupId, Array.from(selectedPermissionIds));

      if (result.success) {
        setSuccess(result.message || "Permissions updated successfully");
        setTimeout(() => {
          setSuccess(null);
          onSave?.();
        }, 1000);
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || "Failed to update permissions");
    } finally {
      setIsSaving(false);
    }
  };

  // Check if there are changes
  const hasChanges = useMemo(() => {
    const initialSet = new Set(initialPermissionIds);
    if (initialSet.size !== selectedPermissionIds.size) return true;
    for (const id of selectedPermissionIds) {
      if (!initialSet.has(id)) return true;
    }
    return false;
  }, [initialPermissionIds, selectedPermissionIds]);

  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <p className="text-neutral-600 dark:text-neutral-400">Loading permissions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-error-400 hover:text-error-600 dark:hover:text-error-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-lg bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-success-600 dark:text-success-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-success-800 dark:text-success-200">{success}</p>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="text-success-400 hover:text-success-600 dark:hover:text-success-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Search and Bulk Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            label="Search permissions"
            placeholder="Search by name, description, or key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 items-end">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>
            Deselect All
          </Button>
        </div>
      </div>

      {/* Permissions List */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {categories
          .filter((cat) => permissionsByCategory[cat] && permissionsByCategory[cat].length > 0)
          .map((category) => {
            const categoryPerms = permissionsByCategory[category] || [];
            const selectedCount = getCategorySelectedCount(category);
            const totalCount = categoryPerms.length;
            const isExpanded = expandedCategories.has(category);
            const allSelected = selectedCount === totalCount && totalCount > 0;

            return (
              <div
                key={category}
                className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden"
              >
                {/* Category Header */}
                <div className="bg-neutral-50 dark:bg-neutral-900 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      <svg
                        className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <div>
                      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 capitalize">
                        {category.replace(/_/g, " ")}
                      </h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {selectedCount} of {totalCount} selected
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => (allSelected ? deselectAllInCategory(category) : selectAllInCategory(category))}
                      className="w-4 h-4 text-primary-600 rounded border-neutral-300 dark:border-neutral-700"
                    />
                  </div>
                </div>

                {/* Category Permissions */}
                {isExpanded && (
                  <div className="p-4 space-y-3 bg-white dark:bg-neutral-800">
                    {categoryPerms.map((permission) => {
                      const isSelected = selectedPermissionIds.has(permission.id);

                      return (
                        <div
                          key={permission.id}
                          className="flex items-start gap-3 p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                        >
                          <input
                            type="checkbox"
                            id={`perm-${permission.id}`}
                            checked={isSelected}
                            onChange={() => togglePermission(permission.id)}
                            className="mt-1 w-4 h-4 text-primary-600 rounded border-neutral-300 dark:border-neutral-700"
                          />
                          <label
                            htmlFor={`perm-${permission.id}`}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="font-medium text-neutral-900 dark:text-neutral-100">
                              {permission.name}
                            </div>
                            {permission.description && (
                              <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                                {permission.description}
                              </div>
                            )}
                            <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1 font-mono">
                              {permission.key}
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          onClick={handleSave}
          loading={isSaving}
          disabled={!hasChanges || isSaving}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}
