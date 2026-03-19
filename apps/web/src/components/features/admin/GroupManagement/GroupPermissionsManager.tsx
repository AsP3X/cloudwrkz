"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { updateGroupPermissions, addDynamicTicketPermissionToGroup } from "@/server/actions/groups";
import { getPermissions, getPermissionCategories, getGroupPermissions, getGroupDynamicTicketPermissions } from "@/server/actions/permissions";
import { getTickets } from "@/server/actions/tickets";
import type { Permission } from "@/generated/prisma";
import { TICKET_PERMISSION_ACTIONS, type TicketPermissionAction, generateTicketPermissionKey, isDynamicTicketPermission } from "@/lib/utils/permissions";
import { getTicketTypePrefix } from "@/lib/utils/tickets";

interface GroupPermissionsManagerProps {
  groupId: string;
  initialPermissionIds?: string[];
  onSave?: () => void;
  onCancel?: () => void;
}

const EMPTY_PERMISSION_IDS: string[] = [];

export function GroupPermissionsManager({
  groupId,
  initialPermissionIds = EMPTY_PERMISSION_IDS,
  onSave,
  onCancel,
}: GroupPermissionsManagerProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(
    new Set()
  );
  const [basePermissionIds, setBasePermissionIds] = useState<string[]>(initialPermissionIds);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Dynamic ticket permissions
  const [dynamicTicketPermissions, setDynamicTicketPermissions] = useState<
    Array<Permission & { ticketId: string | null; prefix: string | null; action: TicketPermissionAction | null }>
  >([]);
  const [baseDynamicPermissions, setBaseDynamicPermissions] = useState<
    Array<Permission & { ticketId: string | null; prefix: string | null; action: TicketPermissionAction | null }>
  >([]);
  const [showAddDynamicPermissionDialog, setShowAddDynamicPermissionDialog] = useState(false);
  const [ticketSearchQuery, setTicketSearchQuery] = useState("");
  const [availableTickets, setAvailableTickets] = useState<Array<{ id: string; ticketNumber: string; title: string; type: string }>>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [selectedTicketPrefix, setSelectedTicketPrefix] = useState("");
  const [selectedTicketNumber, setSelectedTicketNumber] = useState("");
  const [selectedTicketActions, setSelectedTicketActions] = useState<Set<TicketPermissionAction>>(new Set(["view"]));
  const [isAddingDynamic, setIsAddingDynamic] = useState(false);
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false);
  const [pendingDynamicPermissions, setPendingDynamicPermissions] = useState<
    Array<{ ticketId: string; ticketPrefix: string; ticketNumber: string; action: TicketPermissionAction; permissionId?: string }>
  >([]);

  // Load permissions and categories
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const [perms, cats, groupPerms, dynamicPerms] = await Promise.all([
          getPermissions(),
          getPermissionCategories(),
          getGroupPermissions(groupId),
          getGroupDynamicTicketPermissions(groupId),
        ]);
        
        // Merge static permissions with dynamic permissions for display
        // Dynamic permissions should appear in the permissions list as well
        const allPermissions = [...perms];
        const dynamicPermissionIds = new Set(perms.filter(p => isDynamicTicketPermission(p.key)).map(p => p.id));
        
        // Add dynamic permissions that aren't already in the permissions list
        dynamicPerms.forEach((dp) => {
          if (!dynamicPermissionIds.has(dp.id)) {
            allPermissions.push(dp);
          }
        });
        
        setPermissions(allPermissions);
        setCategories(cats);
        const loadedPermissionIds = groupPerms.map((p) => p.id);
        setSelectedPermissionIds(new Set(loadedPermissionIds));
        setBasePermissionIds(loadedPermissionIds);
        setDynamicTicketPermissions(dynamicPerms);
        setBaseDynamicPermissions(dynamicPerms);
        setPendingDynamicPermissions([]);
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

  // Filter permissions by search query and separate static from dynamic
  const filteredPermissions = useMemo(() => {
    // Separate static and dynamic permissions
    const staticPermissions = permissions.filter((p) => !isDynamicTicketPermission(p.key));
    const dynamicPermissions = permissions.filter((p) => isDynamicTicketPermission(p.key));
    
    // Combine all permissions for filtering
    const allPermissions = [...staticPermissions, ...dynamicPermissions];
    
    if (!searchQuery.trim()) {
      return allPermissions;
    }
    const query = searchQuery.toLowerCase();
    return allPermissions.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.key.toLowerCase().includes(query)
    );
  }, [permissions, searchQuery]);

  // Group permissions by category, with dynamic permissions in their own category
  const permissionsByCategory = useMemo(() => {
    const grouped: Record<string, Permission[]> = {};
    
    // First, add all static permissions grouped by their category
    for (const perm of filteredPermissions) {
      if (isDynamicTicketPermission(perm.key)) {
        // Skip dynamic permissions here - they'll be added separately
        continue;
      }
      if (!grouped[perm.category]) {
        grouped[perm.category] = [];
      }
      grouped[perm.category].push(perm);
    }
    
    // Add dynamic permissions as a separate "dynamic" category
    const dynamicPerms = filteredPermissions.filter((p) => isDynamicTicketPermission(p.key));
    if (dynamicPerms.length > 0) {
      grouped["dynamic"] = dynamicPerms;
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

      // First, save static permission changes
      const permissionIdsArray = Array.from(selectedPermissionIds);
      const staticResult = await updateGroupPermissions(groupId, permissionIdsArray);

      if (!staticResult.success) {
        setError(staticResult.error);
        setIsSaving(false);
        return;
      }

      // Then, handle dynamic permission changes
      // 1. Add pending dynamic permissions
      if (pendingDynamicPermissions.length > 0) {
        const addResults = await Promise.allSettled(
          pendingDynamicPermissions.map((p) =>
            addDynamicTicketPermissionToGroup(groupId, p.ticketId, p.ticketPrefix, p.ticketNumber, p.action)
          )
        );

        const addFailures = addResults.filter(
          (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)
        );

        if (addFailures.length > 0) {
          const errorMessages = addFailures
            .map((f) => {
              if (f.status === "rejected") return f.reason?.message || "Unknown error";
              if (f.status === "fulfilled" && !f.value.success) return f.value.error || "Unknown error";
              return "Unknown error";
            })
            .join(", ");
          setError(`Failed to add some dynamic permissions: ${errorMessages}`);
          setIsSaving(false);
          return;
        }
      }

      // 2. Remove dynamic permissions that were deleted
      // Check both the dynamicTicketPermissions state and selectedPermissionIds
      // A dynamic permission is removed if it was in baseDynamicPermissions but is not in selectedPermissionIds
      const currentSelectedIds = new Set(selectedPermissionIds);
      const removedDynamicKeys = new Set(
        baseDynamicPermissions
          .filter((base) => !currentSelectedIds.has(base.id))
          .map((p) => p.id)
      );

      // Note: The updateGroupPermissions call above already handles removing permissions
      // that are not in selectedPermissionIds, so we don't need to call it again here.
      // The removal is already handled by the first updateGroupPermissions call.

      // Reload all permissions to get updated state
      const [updatedGroupPerms, updatedDynamicPerms] = await Promise.all([
        getGroupPermissions(groupId),
        getGroupDynamicTicketPermissions(groupId),
      ]);

      const updatedPermissionIds = updatedGroupPerms.map((p) => p.id);
      setSelectedPermissionIds(new Set(updatedPermissionIds));
      setBasePermissionIds(updatedPermissionIds);
      setDynamicTicketPermissions(updatedDynamicPerms);
      setBaseDynamicPermissions(updatedDynamicPerms);
      setPendingDynamicPermissions([]);

      setSuccess("Permissions updated successfully");
      setTimeout(() => {
        setSuccess(null);
        onSave?.();
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Failed to update permissions");
    } finally {
      setIsSaving(false);
    }
  };

  // Load tickets for search
  useEffect(() => {
    if (!showAddDynamicPermissionDialog) return;

    async function loadTickets() {
      try {
        setIsLoadingTickets(true);
        const tickets = await getTickets({ sortBy: "createdAt", sortOrder: "desc" });
        setAvailableTickets(
          tickets.map((t) => ({
            id: t.id,
            ticketNumber: t.ticketNumber,
            title: t.title,
            type: t.type,
          }))
        );
      } catch (err: any) {
        console.error("Failed to load tickets:", err);
      } finally {
        setIsLoadingTickets(false);
      }
    }

    loadTickets();
  }, [showAddDynamicPermissionDialog]);

  // Close actions dropdown when dialog closes
  useEffect(() => {
    if (!showAddDynamicPermissionDialog) {
      setIsActionsDropdownOpen(false);
    }
  }, [showAddDynamicPermissionDialog]);

  // Filter tickets by search query
  const filteredTickets = useMemo(() => {
    if (!ticketSearchQuery.trim()) {
      return availableTickets.slice(0, 50); // Limit to first 50 when no search
    }
    const query = ticketSearchQuery.toLowerCase();
    return availableTickets
      .filter(
        (t) =>
          t.ticketNumber.toLowerCase().includes(query) ||
          t.title.toLowerCase().includes(query)
      )
      .slice(0, 50); // Limit results
  }, [availableTickets, ticketSearchQuery]);

  // Toggle action selection
  const toggleAction = (action: TicketPermissionAction) => {
    setSelectedTicketActions((prev) => {
      const next = new Set(prev);
      if (next.has(action)) {
        next.delete(action);
      } else {
        next.add(action);
      }
      // Ensure at least one action is selected
      if (next.size === 0) {
        next.add("view");
      }
      return next;
    });
  };

  // Remove action from selection
  const removeAction = (action: TicketPermissionAction) => {
    setSelectedTicketActions((prev) => {
      const next = new Set(prev);
      next.delete(action);
      // Ensure at least one action is selected
      if (next.size === 0) {
        next.add("view");
      }
      return next;
    });
  };

  // Format action name for display
  const formatActionName = (action: TicketPermissionAction): string => {
    return action.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Handle adding dynamic ticket permissions (adds to pending list, doesn't save immediately)
  const handleAddDynamicPermission = () => {
    if (!selectedTicketId.trim() || !selectedTicketPrefix.trim()) {
      setError("Please select a ticket");
      return;
    }

    if (selectedTicketActions.size === 0) {
      setError("Please select at least one permission action");
      return;
    }

    const actions = Array.from(selectedTicketActions);

    // Check for duplicates using the new format
    const existingKeys = new Set([
      ...dynamicTicketPermissions.map((p) => p.key),
      ...pendingDynamicPermissions.map((p) => 
        generateTicketPermissionKey(p.ticketId, p.ticketPrefix, p.action)
      ),
    ]);

    const newPermissions: Array<{ ticketId: string; ticketPrefix: string; ticketNumber: string; action: TicketPermissionAction }> = [];
    const duplicates: string[] = [];

    actions.forEach((action) => {
      const key = generateTicketPermissionKey(selectedTicketId, selectedTicketPrefix, action);
      if (existingKeys.has(key)) {
        duplicates.push(key);
      } else {
        newPermissions.push({ 
          ticketId: selectedTicketId, 
          ticketPrefix: selectedTicketPrefix,
          ticketNumber: selectedTicketNumber,
          action 
        });
      }
    });

    if (duplicates.length > 0) {
      setError(`Some permissions already exist: ${duplicates.join(", ")}`);
      return;
    }

    // Add to pending list
    setPendingDynamicPermissions((prev) => [...prev, ...newPermissions]);
    setError(null);
    setSuccess(null);

    // Reset form
    setSelectedTicketId("");
    setSelectedTicketPrefix("");
    setSelectedTicketNumber("");
    setSelectedTicketActions(new Set(["view"]));
    setTicketSearchQuery("");
    setShowAddDynamicPermissionDialog(false);
  };

  // Handle removing dynamic ticket permission (marks for removal, doesn't save immediately)
  const handleRemoveDynamicPermission = (permissionId: string) => {
    // Find the permission to remove
    const permToRemove = dynamicTicketPermissions.find((p) => p.id === permissionId);
    
    if (permToRemove && permToRemove.ticketId && permToRemove.prefix && permToRemove.action) {
      // Check if it's in pending additions - if so, just remove from pending
      const pendingIndex = pendingDynamicPermissions.findIndex(
        (p) => p.ticketId === permToRemove.ticketId && p.ticketPrefix === permToRemove.prefix && p.action === permToRemove.action
      );
      
      if (pendingIndex >= 0) {
        // Remove from pending additions
        setPendingDynamicPermissions((prev) => prev.filter((_, i) => i !== pendingIndex));
      } else {
        // Mark for removal by removing from dynamicTicketPermissions
        // We'll track removals by comparing with baseDynamicPermissions on save
        setDynamicTicketPermissions((prev) => prev.filter((p) => p.id !== permissionId));
      }
      
      // Also remove from selectedPermissionIds
      setSelectedPermissionIds((prev) => {
        const next = new Set(prev);
        next.delete(permissionId);
        return next;
      });
    }
  };

  // Check if there are changes (static permissions or dynamic permissions)
  const hasChanges = useMemo(() => {
    // Check static permission changes
    const initialSet = new Set(basePermissionIds);
    if (initialSet.size !== selectedPermissionIds.size) return true;
    for (const id of selectedPermissionIds) {
      if (!initialSet.has(id)) return true;
    }
    for (const id of basePermissionIds) {
      if (!selectedPermissionIds.has(id)) return true;
    }
    
    // Check dynamic permission changes
    // Compare current dynamic permissions with base
    const currentDynamicKeys = new Set(
      dynamicTicketPermissions.map((p) => p.key)
    );
    const baseDynamicKeys = new Set(
      baseDynamicPermissions.map((p) => p.key)
    );
    
    // Check if any were removed
    if (currentDynamicKeys.size !== baseDynamicKeys.size) return true;
    for (const key of currentDynamicKeys) {
      if (!baseDynamicKeys.has(key)) return true;
    }
    for (const key of baseDynamicKeys) {
      if (!currentDynamicKeys.has(key)) return true;
    }
    
    // Check if there are pending additions
    if (pendingDynamicPermissions.length > 0) return true;
    
    return false;
  }, [basePermissionIds, selectedPermissionIds, dynamicTicketPermissions, baseDynamicPermissions, pendingDynamicPermissions]);

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

      {/* Dynamic Permissions Section */}
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="bg-neutral-50 dark:bg-neutral-900 p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Dynamic Permissions
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Ticket-specific permissions (e.g., tickets.TSK-000001.view)
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDynamicPermissionDialog(true)}
          >
            Add Permission
          </Button>
        </div>

        {/* Dynamic Permissions List */}
        {(dynamicTicketPermissions.length > 0 || pendingDynamicPermissions.length > 0) && (
          <div className="p-4 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700">
            <div className="space-y-2">
              {/* Existing dynamic permissions */}
              {dynamicTicketPermissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {perm.name}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                      {perm.description}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1 font-mono">
                      {perm.key}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveDynamicPermission(perm.id)}
                    disabled={isSaving}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              
              {/* Pending dynamic permissions (to be added) */}
              {pendingDynamicPermissions.map((pending, index) => {
                const key = generateTicketPermissionKey(pending.ticketId, pending.ticketPrefix, pending.action);
                const actionName = formatActionName(pending.action);
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-lg bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-primary-900 dark:text-primary-100">
                        Ticket {pending.ticketNumber} - {actionName}
                      </div>
                      <div className="text-sm text-primary-600 dark:text-primary-400 mt-1">
                        Permission to {actionName.toLowerCase()} ticket {pending.ticketNumber}
                      </div>
                      <div className="text-xs text-primary-500 dark:text-primary-500 mt-1 font-mono">
                        {key}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary-600 dark:text-primary-400">Pending</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPendingDynamicPermissions((prev) => prev.filter((_, i) => i !== index));
                        }}
                        disabled={isSaving}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {dynamicTicketPermissions.length === 0 && pendingDynamicPermissions.length === 0 && (
          <div className="p-4 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 text-center text-neutral-600 dark:text-neutral-400">
            No dynamic permissions assigned. Click &quot;Add Permission&quot; to add one.
          </div>
        )}
      </div>

      {/* Add Dynamic Permission Dialog */}
      <Dialog
        open={showAddDynamicPermissionDialog}
        onOpenChange={setShowAddDynamicPermissionDialog}
        title="Add Dynamic Permission"
        description="Search for a ticket and select an action to create a dynamic permission"
      >
        <div className="p-6 space-y-4">
          {/* Search */}
          <div>
            <Input
              label="Search Tickets"
              placeholder="Search by ticket number or title..."
              value={ticketSearchQuery}
              onChange={(e) => setTicketSearchQuery(e.target.value)}
              helperText="Type to search for tickets"
            />
          </div>

          {/* Action Selection */}
          <div>
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Permission Actions
            </span>
            <div className="relative">
              {/* Dropdown Button */}
              <button
                type="button"
                onClick={() => setIsActionsDropdownOpen(!isActionsDropdownOpen)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-left flex items-center justify-between hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <span className="text-neutral-600 dark:text-neutral-400">
                  {selectedTicketActions.size === 0
                    ? "Select actions..."
                    : `${selectedTicketActions.size} action${selectedTicketActions.size > 1 ? "s" : ""} selected`}
                </span>
                <svg
                  className={`w-5 h-5 text-neutral-400 transition-transform ${
                    isActionsDropdownOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isActionsDropdownOpen && (
                <>
                  {/* Backdrop to close dropdown */}
                  <div
                    role="presentation"
                    className="fixed inset-0 z-10"
                    onClick={() => setIsActionsDropdownOpen(false)}
                  />
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {TICKET_PERMISSION_ACTIONS.map((action) => {
                      const isSelected = selectedTicketActions.has(action);
                      return (
                        <label
                          key={action}
                          className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors ${
                            isSelected ? "bg-primary-50 dark:bg-primary-900" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAction(action)}
                            className="w-4 h-4 text-primary-600 rounded border-neutral-300 dark:border-neutral-700"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-sm text-neutral-900 dark:text-neutral-100 flex-1">
                            {formatActionName(action)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Selected Actions List */}
            {selectedTicketActions.size > 0 && (
              <div className="mt-3 space-y-2">
                {Array.from(selectedTicketActions).map((action) => (
                  <div
                    key={action}
                    className="flex items-center justify-between px-3 py-2 bg-primary-50 dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-lg"
                  >
                    <span className="text-sm text-primary-900 dark:text-primary-100">
                      {formatActionName(action)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAction(action)}
                      className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 transition-colors"
                      aria-label={`Remove ${formatActionName(action)}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ticket List */}
          <div>
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Select Ticket
            </span>
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg max-h-[300px] overflow-y-auto">
              {isLoadingTickets ? (
                <div className="p-4 text-center text-neutral-600 dark:text-neutral-400">
                  Loading tickets...
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="p-4 text-center text-neutral-600 dark:text-neutral-400">
                  {ticketSearchQuery.trim() ? "No tickets found" : "Start typing to search for tickets"}
                </div>
              ) : (
                <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {filteredTickets.map((ticket) => {
                    const ticketPrefix = getTicketTypePrefix(ticket.type as any);
                    const isSelected = selectedTicketId === ticket.id;
                    
                    return (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => {
                          setSelectedTicketId(ticket.id);
                          setSelectedTicketPrefix(ticketPrefix);
                          setSelectedTicketNumber(ticket.ticketNumber);
                        }}
                        className={`w-full text-left p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                          isSelected
                            ? "bg-primary-50 dark:bg-primary-950 border-l-4 border-primary-500"
                            : ""
                        }`}
                      >
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {ticket.ticketNumber}
                        </div>
                        <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 truncate">
                          {ticket.title}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDynamicPermissionDialog(false);
                setTicketSearchQuery("");
                setSelectedTicketId("");
                setSelectedTicketPrefix("");
                setSelectedTicketNumber("");
                setSelectedTicketActions(new Set(["view"]));
              }}
              disabled={isAddingDynamic}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddDynamicPermission}
              loading={isAddingDynamic}
              disabled={!selectedTicketId.trim() || selectedTicketActions.size === 0 || isAddingDynamic}
            >
              Add {selectedTicketActions.size > 0 ? `${selectedTicketActions.size} ` : ""}Permission{selectedTicketActions.size > 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Permissions List */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {(() => {
          // Get all categories including "dynamic" if it exists
          const allCategories = [
            ...categories.filter((cat) => permissionsByCategory[cat] && permissionsByCategory[cat].length > 0),
            ...(permissionsByCategory["dynamic"] && permissionsByCategory["dynamic"].length > 0 ? ["dynamic"] : [])
          ];
          
          return allCategories.map((category) => {
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
                        {category === "dynamic" ? "Dynamic Permissions" : category.replace(/_/g, " ")}
                      </h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {selectedCount} of {totalCount} selected
                        {category === "dynamic" && (
                          <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-500">
                            (Ticket-specific permissions)
                          </span>
                        )}
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
          });
        })()}
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
