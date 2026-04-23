import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ROUTES } from "@/lib/constants/routes";
import { formatDateTimeFull } from "@/lib/utils/date";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { Checkbox } from "@/components/ui/Checkbox";
import type { AdminGroup } from "@/lib/types";

// Human: Deep admin user inspector covering bans, groups, permissions, and account edits.
// Agent: FETCH /admin/users/:id + permissions; MULTIPLE dialogs; REQUIRES admin.users.*.

const CARD_CLASS =
  "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6";

interface UserDetailData {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  lastLoginAt: string | null;
  bannedAt?: string | null;
  banReason?: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    createdTickets: number;
    assignedTickets: number;
    ticketComments: number;
    groupMemberships: number;
  };
  groupMemberships: Array<{
    id: string;
    group: { id: string; name: string; description: string | null };
  }>;
}

// Human: Maps user lifecycle statuses to badge color tokens for consistent admin list/detail styling.
// Agent: SWITCH status ACTIVE|PENDING|SUSPENDED|BANNED|DELETED|default; RETURNS Badge variant token; PURE.

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "ACTIVE": return "success" as const;
    case "PENDING": return "warning" as const;
    case "SUSPENDED": return "error" as const;
    case "BANNED": return "error" as const;
    case "DELETED": return "default" as const;
    default: return "default" as const;
  }
}

// Human: Maps coarse RBAC roles to badge variants so privileged accounts pop visually in admin surfaces.
// Agent: SWITCH role ADMIN|MODERATOR|AGENT|default; RETURNS Badge variant token; PURE.

function getRoleBadgeVariant(role: string) {
  switch (role) {
    case "ADMIN": return "error" as const;
    case "MODERATOR": return "warning" as const;
    case "AGENT": return "info" as const;
    default: return "default" as const;
  }
}

// Human: Page controller loading the user record, effective permissions, and orchestrating every admin sub-action.
// Agent: useParams id; STATE user,effectivePermissions,loading*; navigate guards; COMPOSITION of many admin sections.

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can, user: authUser } = useAuth();
  const canViewUsers = can("admin.users.view");
  const canManagePermissions = can("admin.permissions.manage");
  const canManageGroups = authUser?.role === "ADMIN" || can("admin.groups.manage");
  const canUpdateUser = authUser?.role === "ADMIN" || can("admin.users.update");
  const [user, setUser] = useState<UserDetailData | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unbanOpen, setUnbanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", role: "USER", status: "ACTIVE" });
  const [unbanReason, setUnbanReason] = useState("");
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [allGroups, setAllGroups] = useState<AdminGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupActionLoading, setGroupActionLoading] = useState(false);
  const [groupActionError, setGroupActionError] = useState<string | null>(null);
  const [verifySaving, setVerifySaving] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const reloadUser = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<{ user: UserDetailData }>(`/admin/users/${id}`);
      if (data.user) setUser(data.user);
    } catch {
      /* keep existing user on transient failure */
    }
  }, [id]);

  useEffect(() => {
    if (!canViewUsers || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ user: UserDetailData }>(`/admin/users/${id}`);
        if (!cancelled && data.user) {
          setUser(data.user);
          setFormData({
            name: data.user.name ?? "",
            role: data.user.role,
            status: data.user.status,
          });
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canViewUsers, id]);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    (async () => {
      setLoadingPerms(true);
      try {
        const data = await api.get<{ permissions: string[] }>(`/admin/users/${id}/effective-permissions`);
        if (!cancelled) setEffectivePermissions(data.permissions ?? []);
      } catch {
        if (!cancelled) setEffectivePermissions([]);
      } finally {
        if (!cancelled) setLoadingPerms(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, user]);

  useEffect(() => {
    if (!addToGroupOpen || !canManageGroups || !id) return;
    let cancelled = false;
    api
      .get<{ groups?: AdminGroup[] }>("/admin/groups")
      .then((data) => {
        if (!cancelled) setAllGroups(data.groups ?? []);
      })
      .catch(() => {
        if (!cancelled) setAllGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [addToGroupOpen, canManageGroups, id]);

  const groupsNotJoined = useMemo(() => {
    const joined = new Set((user?.groupMemberships ?? []).map((m) => m.group.id));
    return allGroups.filter((g) => !joined.has(g.id));
  }, [allGroups, user?.groupMemberships]);

  const filteredGroupsForAdd = useMemo(() => {
    if (!groupSearch.trim()) return groupsNotJoined;
    const q = groupSearch.toLowerCase();
    return groupsNotJoined.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description ?? "").toLowerCase().includes(q),
    );
  }, [groupsNotJoined, groupSearch]);

  const handleAddToGroup = async () => {
    if (!id || !selectedGroupId) return;
    setGroupActionError(null);
    setGroupActionLoading(true);
    try {
      await api.post(`/admin/groups/${selectedGroupId}/members`, { userId: id });
      setSelectedGroupId("");
      setGroupSearch("");
      setAddToGroupOpen(false);
      await reloadUser();
    } catch (e) {
      setGroupActionError(e instanceof ApiError ? e.message : "Failed to add to group");
    } finally {
      setGroupActionLoading(false);
    }
  };

  const handleRemoveFromGroup = async (groupId: string) => {
    if (!id) return;
    setGroupActionError(null);
    setGroupActionLoading(true);
    try {
      await api.delete(`/admin/groups/${groupId}/members/${id}`);
      await reloadUser();
    } catch (e) {
      setGroupActionError(e instanceof ApiError ? e.message : "Failed to remove from group");
    } finally {
      setGroupActionLoading(false);
    }
  };

  const accountStatusToggleEnabled =
    user != null && (user.status === "ACTIVE" || user.status === "PENDING");

  const handleEmailVerifiedChange = async (checked: boolean) => {
    if (!id || !user || !canUpdateUser || checked === user.emailVerified) return;
    setVerifyError(null);
    setVerifySaving(true);
    try {
      await api.patch(`/admin/users/${id}`, { emailVerified: checked });
      await reloadUser();
    } catch (e) {
      setVerifyError(e instanceof ApiError ? e.message : "Failed to update email verification");
    } finally {
      setVerifySaving(false);
    }
  };

  const handleAccountActiveChange = async (checked: boolean) => {
    if (!id || !user || !canUpdateUser || !accountStatusToggleEnabled) return;
    const nextStatus = checked ? "ACTIVE" : "PENDING";
    if (nextStatus === user.status) return;
    setVerifyError(null);
    setVerifySaving(true);
    try {
      await api.patch(`/admin/users/${id}`, { status: nextStatus });
      await reloadUser();
    } catch (e) {
      setVerifyError(e instanceof ApiError ? e.message : "Failed to update account status");
    } finally {
      setVerifySaving(false);
    }
  };

  const filteredPermissions = useMemo(() => {
    if (!permissionSearch.trim()) return effectivePermissions;
    const q = permissionSearch.toLowerCase();
    return effectivePermissions.filter((p) => p.toLowerCase().includes(q));
  }, [effectivePermissions, permissionSearch]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/admin/users/${id}`, {
        name: formData.name || null,
        role: formData.role,
        status: formData.status,
      });
      const data = await api.get<{ user: UserDetailData }>(`/admin/users/${id}`);
      setUser(data.user);
      setEditOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/admin/users/${id}`);
      navigate("/dashboard/admin/users");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUnban = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/users/${id}/unban`, { reason: unbanReason });
      const data = await api.get<{ user: UserDetailData }>(`/admin/users/${id}`);
      setUser(data.user);
      setUnbanReason("");
      setUnbanOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unban failed");
    } finally {
      setSaving(false);
    }
  };

  if (!canViewUsers) {
    return (
      <AccessDeniedWarning
        message="You don't have permission to view user details."
        primaryLabel="Back to Dashboard"
        primaryHref={ROUTES.DASHBOARD}
      />
    );
  }

  if (loading || !id) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <p className="text-neutral-600 dark:text-neutral-400">User not found.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard/admin/users")}>
          Back to Users
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link
            to="/dashboard/admin/users"
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block"
          >
            ← Back to Users
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {user.name || user.email.split("@")[0]}
            </h1>
            <Badge variant={getRoleBadgeVariant(user.role)} size="md">
              {user.role}
            </Badge>
            <Badge variant={getStatusBadgeVariant(user.status)} size="md">
              {user.status}
            </Badge>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">{user.email}</p>
        </div>
        <div className="flex gap-2">
          {canManagePermissions && (
            <Link to={`/dashboard/admin/permissions/users/${user.id}`}>
              <Button variant="outline">Manage Permissions</Button>
            </Link>
          )}
          {user.status === "BANNED" && (
            <Button variant="primary" onClick={() => setUnbanOpen(true)}>
              Unban User
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit User
          </Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Delete User
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created Tickets</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{user._count.createdTickets}</p>
        </div>
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Assigned Tickets</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{user._count.assignedTickets}</p>
        </div>
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Comments</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{user._count.ticketComments}</p>
        </div>
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Group Memberships</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{user._count.groupMemberships}</p>
        </div>
      </div>

      {/* User Details */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">User Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Email</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">{user.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Name</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">{user.name || "—"}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created At</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">{formatDateTimeFull(user.createdAt)}</p>
          </div>
          {user.lastLoginAt && (
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Last Login</p>
              <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">{formatDateTimeFull(user.lastLoginAt)}</p>
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
            Account & verification
          </h3>
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Account status</span>
                <Badge variant={getStatusBadgeVariant(user.status)} size="sm">
                  {user.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Email</span>
                <Badge variant={user.emailVerified ? "success" : "warning"} size="sm">
                  {user.emailVerified ? "Verified" : "Not verified"}
                </Badge>
              </div>
            </div>
            {canUpdateUser && (
              <div className="flex-1 min-w-0 lg:pl-6 lg:border-l lg:border-neutral-200 lg:dark:border-neutral-800 space-y-3">
                {verifyError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                    {verifyError}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:gap-x-8 sm:gap-y-3">
                  <div className="flex items-start gap-3 min-w-[200px]">
                    <Checkbox
                      checked={user.emailVerified}
                      onChange={(e) => void handleEmailVerifiedChange(e.target.checked)}
                      disabled={verifySaving}
                      aria-label="Email verified"
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-medium text-neutral-900 dark:text-neutral-100 text-sm">Email verified</span>
                      <span className="block text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                        Mark verified without sending a link.
                      </span>
                    </div>
                  </div>
                  <div className={`flex items-start gap-3 min-w-[200px] ${accountStatusToggleEnabled ? "" : "opacity-60"}`}>
                    <Checkbox
                      checked={user.status === "ACTIVE"}
                      onChange={(e) => void handleAccountActiveChange(e.target.checked)}
                      disabled={verifySaving || !accountStatusToggleEnabled}
                      aria-label="Active account"
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-medium text-neutral-900 dark:text-neutral-100 text-sm">Active account</span>
                      <span className="block text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                        {accountStatusToggleEnabled
                          ? "Active or Pending only. Use Edit User for other statuses."
                          : `Toggle available for Active or Pending (now ${user.status}).`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Group Memberships */}
      <div className={CARD_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Group Memberships</h2>
          {canManageGroups && (
            <Button variant="primary" size="sm" onClick={() => setAddToGroupOpen(true)} disabled={groupActionLoading}>
              Add to Group
            </Button>
          )}
        </div>
        {groupActionError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {groupActionError}
          </div>
        )}
        {user.groupMemberships && user.groupMemberships.length > 0 ? (
          <div className="space-y-3">
            {user.groupMemberships.map((membership) => (
              <div
                key={membership.id}
                className="flex items-center justify-between gap-3 p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              >
                <div>
                  <Link
                    to={`/dashboard/admin/groups/${membership.group.id}`}
                    className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    {membership.group.name}
                  </Link>
                  {membership.group.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{membership.group.description}</p>
                  )}
                </div>
                {canManageGroups && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleRemoveFromGroup(membership.group.id)}
                    disabled={groupActionLoading}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-neutral-600 dark:text-neutral-400">
            This user is not in any groups{canManageGroups ? ". Use Add to Group to assign one." : "."}
          </p>
        )}
      </div>

      {/* Effective Permissions */}
      <div className={CARD_CLASS}>
        <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4 mb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Effective Permissions</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                This user has {effectivePermissions.length} permission{effectivePermissions.length !== 1 ? "s" : ""}
                {permissionSearch.trim() && filteredPermissions.length !== effectivePermissions.length && (
                  <span className="ml-1">({filteredPermissions.length} shown)</span>
                )}
              </p>
            </div>
            {!loadingPerms && effectivePermissions.length > 0 && (
              <div className="w-full sm:w-80">
                <Input
                  placeholder="Search permissions..."
                  value={permissionSearch}
                  onChange={(e) => setPermissionSearch(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
        {loadingPerms ? (
          <p className="text-neutral-600 dark:text-neutral-400">Loading permissions...</p>
        ) : effectivePermissions.length > 0 ? (
          filteredPermissions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-neutral-600 dark:text-neutral-400 mb-2">No permissions match your search.</p>
              <Button variant="outline" size="sm" onClick={() => setPermissionSearch("")}>Clear Search</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Permission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {filteredPermissions.map((perm) => (
                    <tr key={perm} className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-neutral-900 dark:text-neutral-100">{perm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <p className="text-neutral-600 dark:text-neutral-400">This user has no permissions assigned.</p>
        )}
      </div>

      {/* Ban Information */}
      {user.status === "BANNED" && (user.bannedAt != null || user.banReason) && (
        <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-red-900 dark:text-red-100 mb-4">Ban Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {user.bannedAt && (
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Banned On</p>
                <p className="text-base text-red-900 dark:text-red-100 mt-1">{formatDateTimeFull(user.bannedAt)}</p>
              </div>
            )}
            {user.banReason && (
              <div className="md:col-span-2">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Ban Reason</p>
                <p className="text-base text-red-900 dark:text-red-100 mt-1 whitespace-pre-wrap">{user.banReason}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={addToGroupOpen}
        onOpenChange={(open) => {
          setAddToGroupOpen(open);
          if (!open) {
            setGroupSearch("");
            setSelectedGroupId("");
            setGroupActionError(null);
          }
        }}
        title="Add user to group"
        description={`Add ${user.email} to a group`}
      >
        <div className="p-6 space-y-4">
          {groupActionError && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {groupActionError}
            </div>
          )}
          {groupsNotJoined.length === 0 ? (
            <p className="text-neutral-600 dark:text-neutral-400">
              This user is already a member of every available group, or there are no groups yet.
            </p>
          ) : (
            <>
              <Input
                label="Search groups"
                placeholder="Search by name or description..."
                value={groupSearch}
                onChange={(e) => {
                  setGroupSearch(e.target.value);
                  setSelectedGroupId("");
                }}
              />
              <div className="max-h-[300px] overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-lg">
                {filteredGroupsForAdd.length === 0 ? (
                  <div className="p-4 text-center text-neutral-600 dark:text-neutral-400">
                    No groups match your search.
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredGroupsForAdd.map((g) => {
                      const isSelected = selectedGroupId === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setSelectedGroupId(g.id)}
                          className={`w-full p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                            isSelected ? "bg-primary-50 dark:bg-primary-900/50 border-l-4 border-primary-600" : ""
                          }`}
                        >
                          <div className="font-medium text-neutral-900 dark:text-neutral-100">{g.name}</div>
                          {g.description && (
                            <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{g.description}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={() => setAddToGroupOpen(false)} disabled={groupActionLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleAddToGroup}
              disabled={!selectedGroupId || groupActionLoading}
            >
              {groupActionLoading ? "Adding…" : "Add to Group"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit User"
        description={`Edit user: ${user.email}`}
      >
        <form onSubmit={handleUpdate} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Select
            label="Role"
            options={[
              { value: "USER", label: "User" },
              { value: "AGENT", label: "Agent" },
              { value: "MODERATOR", label: "Moderator" },
              { value: "ADMIN", label: "Admin" },
            ]}
            value={formData.role}
            onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
          />
          <Select
            label="Status"
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "PENDING", label: "Pending" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "BANNED", label: "Banned" },
              { value: "DELETED", label: "Deleted" },
            ]}
            value={formData.status}
            onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete User"
        description={`Are you sure you want to delete ${user.email}? This will schedule the account for deletion.`}
      >
        <div className="p-6">
          <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg mb-4">
            <p className="text-sm text-red-700 dark:text-red-300">
              This will mark the user as deleted and schedule removal. This action cannot be undone.
            </p>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={saving}>
              {saving ? "Deleting..." : "Delete User"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Unban Dialog */}
      <Dialog
        open={unbanOpen}
        onOpenChange={setUnbanOpen}
        title="Unban User"
        description={`Unban ${user.email}? This will restore their access.`}
      >
        <div className="p-6">
          <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg mb-4">
            <p className="text-sm text-green-700 dark:text-green-300">
              This will restore the user&apos;s access to the platform.
            </p>
          </div>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Unban Reason <span className="text-red-500">*</span>
            </label>
            <Textarea
              placeholder="Enter the reason for unbanning..."
              value={unbanReason}
              onChange={(e) => setUnbanReason(e.target.value)}
              rows={4}
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setUnbanOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUnban} disabled={saving || !unbanReason.trim()}>
              {saving ? "Saving..." : "Unban User"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
