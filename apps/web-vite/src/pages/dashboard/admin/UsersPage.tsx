import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import type { AdminUser } from "@/lib/types";
import { formatDate } from "@/lib/utils/date";

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case "ADMIN": return "error" as const;
    case "MODERATOR": return "warning" as const;
    case "AGENT": return "info" as const;
    default: return "default" as const;
  }
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case "ACTIVE": return "success" as const;
    case "PENDING": return "warning" as const;
    case "SUSPENDED": return "error" as const;
    case "BANNED": return "error" as const;
    case "DELETED": return "default" as const;
    default: return "default" as const;
  }
};

export default function UsersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [roleFilter, setRoleFilter] = useState(searchParams.get("role") || "");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [unbanDialogOpen, setUnbanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("page", String(page));
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (roleFilter) params.set("role", roleFilter);
      const data = await api.get<{ users: AdminUser[]; total: number; page: number; totalPages: number }>(`/admin/users?${params.toString()}`);
      setUsers(data.users || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, roleFilter, page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const updateFilters = (newFilters: { search?: string; status?: string; role?: string }) => {
    const params = new URLSearchParams();
    const s = newFilters.search ?? search;
    const st = newFilters.status ?? statusFilter;
    const r = newFilters.role ?? roleFilter;
    if (s) params.set("search", s);
    if (st) params.set("status", st);
    if (r) params.set("role", r);
    if (newFilters.search !== undefined) setSearch(newFilters.search);
    if (newFilters.status !== undefined) setStatusFilter(newFilters.status);
    if (newFilters.role !== undefined) setRoleFilter(newFilters.role);
    setPage(1);
    navigate(`/dashboard/admin/users?${params.toString()}`, { replace: true });
  };

  const toggleUserSelection = (userId: string) => {
    const next = new Set(selectedUsers);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    setSelectedUsers(next);
  };

  const toggleAllSelection = () => {
    if (selectedUsers.size === users.length) setSelectedUsers(new Set());
    else setSelectedUsers(new Set(users.map((u) => u.id)));
  };

  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedUsers.size === 0) return;
    setIsLoading(true);
    try {
      await api.post("/admin/users/bulk-status", { userIds: Array.from(selectedUsers), status });
      setSelectedUsers(new Set());
      fetchUsers();
    } catch { /* ignore */ }
    setIsLoading(false);
  };

  const handleCreate = async (data: { email: string; name?: string; password: string; role: string; status: string }) => {
    setIsLoading(true);
    try {
      await api.post("/admin/users", data);
      setCreateDialogOpen(false);
      fetchUsers();
    } catch { /* ignore */ }
    setIsLoading(false);
  };

  const handleEdit = async (userId: string, data: { name?: string; role: string; status: string }) => {
    setIsLoading(true);
    try {
      await api.patch(`/admin/users/${userId}`, data);
      setEditDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch { /* ignore */ }
    setIsLoading(false);
  };

  const handleDelete = async (userId: string) => {
    setIsLoading(true);
    try {
      await api.delete(`/admin/users/${userId}`);
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch { /* ignore */ }
    setIsLoading(false);
  };

  const handleBan = async (userId: string, reason: string) => {
    setIsLoading(true);
    try {
      await api.post(`/admin/users/${userId}/ban`, { reason });
      setBanDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch { /* ignore */ }
    setIsLoading(false);
  };

  const handleUnban = async (userId: string, reason: string) => {
    setIsLoading(true);
    try {
      await api.post(`/admin/users/${userId}/unban`, { reason });
      setUnbanDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch { /* ignore */ }
    setIsLoading(false);
  };

  if (user?.role !== "ADMIN" && user?.role !== "MODERATOR") {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">User Management</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage all system users ({total} total)
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateDialogOpen(true)}>
          Create User
        </Button>
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            label="Search"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => updateFilters({ search: e.target.value })}
          />
          <Select
            label="Status"
            options={[
              { value: "", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "PENDING", label: "Pending" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "BANNED", label: "Banned" },
              { value: "DELETED", label: "Deleted" },
            ]}
            value={statusFilter}
            onChange={(e) => updateFilters({ status: e.target.value })}
          />
          <Select
            label="Role"
            options={[
              { value: "", label: "All roles" },
              { value: "USER", label: "User" },
              { value: "AGENT", label: "Agent" },
              { value: "MODERATOR", label: "Moderator" },
              { value: "ADMIN", label: "Admin" },
            ]}
            value={roleFilter}
            onChange={(e) => updateFilters({ role: e.target.value })}
          />
          {selectedUsers.size > 0 && (
            <div className="flex items-end gap-2">
              <Select
                label="Bulk Actions"
                options={[
                  { value: "", label: "Select action..." },
                  { value: "ACTIVE", label: "Activate" },
                  { value: "SUSPENDED", label: "Suspend" },
                  { value: "BANNED", label: "Ban" },
                  { value: "DELETED", label: "Delete" },
                ]}
                value=""
                onChange={(e) => {
                  if (e.target.value) handleBulkStatusUpdate(e.target.value);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-neutral-500 dark:text-neutral-400">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedUsers.size === users.length && users.length > 0}
                      onChange={toggleAllSelection}
                      className="rounded border-neutral-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Role</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Created</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-neutral-700 dark:text-neutral-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(u.id)}
                        onChange={() => toggleUserSelection(u.id)}
                        className="rounded border-neutral-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100">{u.email}</td>
                    <td className="px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100">{u.name || "-"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={getRoleBadgeVariant(u.role)} size="sm">{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatusBadgeVariant(u.status)} size="sm">{u.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/dashboard/admin/users/${u.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedUser(u); setEditDialogOpen(true); }}>
                          Edit
                        </Button>
                        {u.status === "BANNED" ? (
                          <Button variant="primary" size="sm" onClick={() => { setSelectedUser(u); setUnbanDialogOpen(true); }}>
                            Unban
                          </Button>
                        ) : (
                          <Button variant="danger" size="sm" onClick={() => { setSelectedUser(u); setBanDialogOpen(true); }}>
                            Ban
                          </Button>
                        )}
                        <Button variant="danger" size="sm" onClick={() => { setSelectedUser(u); setDeleteDialogOpen(true); }}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <UserCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreate}
        isLoading={isLoading}
      />
      {selectedUser && (
        <>
          <UserEditDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            user={selectedUser}
            onSubmit={(data) => handleEdit(selectedUser.id, data)}
            isLoading={isLoading}
          />
          <UserBanDialog
            open={banDialogOpen}
            onOpenChange={setBanDialogOpen}
            user={selectedUser}
            onConfirm={(reason) => handleBan(selectedUser.id, reason)}
            isLoading={isLoading}
          />
          <UserUnbanDialog
            open={unbanDialogOpen}
            onOpenChange={setUnbanDialogOpen}
            user={selectedUser}
            onConfirm={(reason) => handleUnban(selectedUser.id, reason)}
            isLoading={isLoading}
          />
          <UserDeleteDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            user={selectedUser}
            onConfirm={() => handleDelete(selectedUser.id)}
            isLoading={isLoading}
          />
        </>
      )}
    </div>
  );
}

function UserCreateDialog({ open, onOpenChange, onSubmit, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { email: string; name?: string; password: string; role: string; status: string }) => void;
  isLoading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [status, setStatus] = useState("ACTIVE");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ email, name: name || undefined, password, role, status });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Create User" description="Create a new system user">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Select label="Role" options={[
          { value: "USER", label: "User" },
          { value: "AGENT", label: "Agent" },
          { value: "MODERATOR", label: "Moderator" },
          { value: "ADMIN", label: "Admin" },
        ]} value={role} onChange={(e) => setRole(e.target.value)} />
        <Select label="Status" options={[
          { value: "ACTIVE", label: "Active" },
          { value: "PENDING", label: "Pending" },
        ]} value={status} onChange={(e) => setStatus(e.target.value)} />
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
          <Button type="submit" variant="primary" loading={isLoading}>Create User</Button>
        </div>
      </form>
    </Dialog>
  );
}

function UserEditDialog({ open, onOpenChange, user: editUser, onSubmit, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser;
  onSubmit: (data: { name?: string; role: string; status: string }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(editUser.name || "");
  const [role, setRole] = useState(editUser.role);
  const [status, setStatus] = useState(editUser.status);

  useEffect(() => {
    setName(editUser.name || "");
    setRole(editUser.role);
    setStatus(editUser.status);
  }, [editUser]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit User: ${editUser.email}`}>
      <div className="p-6 space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Role" options={[
          { value: "USER", label: "User" },
          { value: "AGENT", label: "Agent" },
          { value: "MODERATOR", label: "Moderator" },
          { value: "ADMIN", label: "Admin" },
        ]} value={role} onChange={(e) => setRole(e.target.value)} />
        <Select label="Status" options={[
          { value: "ACTIVE", label: "Active" },
          { value: "PENDING", label: "Pending" },
          { value: "SUSPENDED", label: "Suspended" },
          { value: "BANNED", label: "Banned" },
        ]} value={status} onChange={(e) => setStatus(e.target.value)} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit({ name: name || undefined, role, status })} loading={isLoading}>Save</Button>
        </div>
      </div>
    </Dialog>
  );
}

function UserBanDialog({ open, onOpenChange, user: banUser, onConfirm, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser;
  onConfirm: (reason: string) => void;
  isLoading: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Ban User: ${banUser.email}`}>
      <div className="p-6 space-y-4">
        <div className="p-4 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg">
          <p className="text-sm text-error-700 dark:text-error-300">
            This will ban the user from accessing the system. They will not be able to log in until unbanned.
          </p>
        </div>
        <Textarea label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} placeholder="Provide a reason for banning this user..." />
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm(reason)} disabled={!reason.trim()} loading={isLoading}>Ban User</Button>
        </div>
      </div>
    </Dialog>
  );
}

function UserUnbanDialog({ open, onOpenChange, user: unbanUser, onConfirm, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser;
  onConfirm: (reason: string) => void;
  isLoading: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Unban User: ${unbanUser.email}`}>
      <div className="p-6 space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          This will restore access for the user. They will be able to log in again.
        </p>
        <Textarea label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} placeholder="Provide a reason for unbanning this user..." />
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
          <Button variant="primary" onClick={() => onConfirm(reason)} disabled={!reason.trim()} loading={isLoading}>Unban User</Button>
        </div>
      </div>
    </Dialog>
  );
}

function UserDeleteDialog({ open, onOpenChange, user: deleteUser, onConfirm, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Delete User: ${deleteUser.email}`}>
      <div className="p-6 space-y-4">
        <div className="p-4 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg">
          <p className="text-sm text-error-700 dark:text-error-300">
            This will permanently mark the user for deletion. This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={isLoading}>Delete User</Button>
        </div>
      </div>
    </Dialog>
  );
}
