import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/utils/date";
import type { AdminUser } from "@/lib/types";

type GroupMemberRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt?: string;
  memberCount?: number;
  members?: GroupMemberRow[];
};

async function refetchGroup(id: string): Promise<GroupDetail | null> {
  try {
    const data = await api.get<{ group: GroupDetail }>(`/admin/groups/${id}`);
    return data.group ?? null;
  } catch {
    return null;
  }
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, user: authUser } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManagePermissions = can("admin.permissions.manage");
  const canManageGroupMembers =
    authUser?.role === "ADMIN" || can("admin.groups.manage");

  const loadGroup = useCallback(async () => {
    if (!id) return;
    const g = await refetchGroup(id);
    setGroup(g);
  }, [id]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    refetchGroup(id)
      .then((g) => {
        if (!cancelled) setGroup(g);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!addMemberOpen || !canManageGroupMembers || !id) return;
    let cancelled = false;
    api
      .get<{ users?: AdminUser[] }>("/admin/users?limit=500")
      .then((data) => {
        if (!cancelled) setAllUsers(data.users ?? []);
      })
      .catch(() => {
        if (!cancelled) setAllUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [addMemberOpen, canManageGroupMembers, id]);

  const members = group?.members ?? [];
  const memberCount = group?.memberCount ?? members.length;

  const memberUserIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const availableUsers = useMemo(
    () => allUsers.filter((u) => !memberUserIds.has(u.id)),
    [allUsers, memberUserIds],
  );

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return availableUsers;
    const q = userSearch.toLowerCase();
    return availableUsers.filter((u) => {
      const name = (u.name ?? "").toLowerCase();
      return name.includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [availableUsers, userSearch]);

  const handleAddMember = async () => {
    if (!id || !selectedUserId) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await api.post(`/admin/groups/${id}/members`, { userId: selectedUserId });
      setSelectedUserId("");
      setUserSearch("");
      setAddMemberOpen(false);
      await loadGroup();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Failed to add member");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!id) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await api.delete(`/admin/groups/${id}/members/${userId}`);
      await loadGroup();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Failed to remove member");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!group || !id) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Group not found</h2>
        <Link to={ROUTES.ADMIN_GROUPS}>
          <Button variant="primary">Back to Groups</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to={ROUTES.ADMIN_GROUPS}>
            <Button variant="outline" size="sm">
              ← Back to Groups
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-4">{group.name}</h1>
          {group.description && (
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">{group.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManagePermissions && (
            <Link to={`${ROUTES.DASHBOARD}/admin/permissions/groups/${group.id}`}>
              <Button variant="outline" size="sm">
                Manage Permissions
              </Button>
            </Link>
          )}
          {canManageGroupMembers && (
            <Button variant="primary" size="sm" onClick={() => setAddMemberOpen(true)} disabled={actionLoading}>
              Add Member
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 p-4 text-sm text-error-700 dark:text-error-300">
          {actionError}
        </div>
      )}

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-500">
          <span>
            {memberCount} member{memberCount !== 1 ? "s" : ""}
          </span>
          <span aria-hidden>•</span>
          <span>Created {formatDate(group.createdAt)}</span>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Members</h2>
          {members.length === 0 ? (
            <p className="text-neutral-600 dark:text-neutral-400">
              No members in this group yet.
              {canManageGroupMembers ? " Use Add Member to invite a user." : ""}
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
                >
                  <div>
                    <Link
                      to={`/dashboard/admin/users/${m.id}`}
                      className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      {m.name || m.email}
                    </Link>
                    {m.name && <p className="text-sm text-neutral-600 dark:text-neutral-400">{m.email}</p>}
                    <div className="mt-1">
                      <Badge variant="info" size="sm">
                        {m.role}
                      </Badge>
                    </div>
                  </div>
                  {canManageGroupMembers && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveMember(m.id)}
                      disabled={actionLoading}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog
        open={addMemberOpen}
        onOpenChange={(open) => {
          setAddMemberOpen(open);
          if (!open) {
            setUserSearch("");
            setSelectedUserId("");
            setActionError(null);
          }
        }}
        title="Add member to group"
        description={`Add a user to ${group.name}`}
      >
        <div className="p-6 space-y-4">
          {actionError && (
            <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300 text-sm">
              {actionError}
            </div>
          )}
          {availableUsers.length === 0 ? (
            <p className="text-neutral-600 dark:text-neutral-400">
              All users are already in this group, or no users are available.
            </p>
          ) : (
            <>
              <Input
                label="Search users"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setSelectedUserId("");
                }}
              />
              <div className="max-h-[300px] overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-lg">
                {filteredUsers.length === 0 ? (
                  <div className="p-4 text-center text-neutral-600 dark:text-neutral-400">
                    No users match your search.
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredUsers.map((u) => {
                      const isSelected = selectedUserId === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSelectedUserId(u.id)}
                          className={`w-full p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                            isSelected ? "bg-primary-50 dark:bg-primary-900/50 border-l-4 border-primary-600" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                                {u.name || u.email}
                              </div>
                              {u.name && (
                                <div className="text-sm text-neutral-600 dark:text-neutral-400">{u.email}</div>
                              )}
                            </div>
                            <Badge variant="info" size="sm">
                              {u.role}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              variant="outline"
              onClick={() => setAddMemberOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddMember}
              disabled={!selectedUserId || actionLoading}
            >
              {actionLoading ? "Adding…" : "Add Member"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
