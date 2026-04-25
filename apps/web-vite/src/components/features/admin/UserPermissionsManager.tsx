import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/api/client";

// Human: React UI for `UserPermissionsManager` in administration and permission management: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE admin; UI permissions; EXPORTS UserPermissionsManager; REACT component; READS props hooks; MAY CALL api client.
export interface Permission {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  category: string;
  module?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface UserPermissionsManagerProps {
  userId: string;
  initialPermissionIds?: string[];
  onSave?: () => void;
}

export function UserPermissionsManager({
  userId,
  initialPermissionIds = [],
  onSave,
}: UserPermissionsManagerProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialPermissionIds));
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [allRes, userRes] = await Promise.all([
          api.get<{ permissions: Permission[] }>("/admin/permissions"),
          api.get<{ permissions: Array<{ id: string; key: string }> }>(`/admin/users/${userId}/permissions`),
        ]);
        if (cancelled) return;
        const all = allRes.permissions ?? [];
        setPermissions(all);
        const ids = new Set((userRes.permissions ?? []).map((p) => p.id));
        setSelectedIds(ids);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load permissions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const byCategory = useMemo(() => {
    const map: Record<string, Permission[]> = {};
    for (const p of permissions) {
      const cat = p.category || "Other";
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    for (const cat of Object.keys(map)) {
      map[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [permissions]);

  const filteredBySearch = useMemo(() => {
    if (!searchQuery.trim()) return byCategory;
    const q = searchQuery.toLowerCase();
    const out: Record<string, Permission[]> = {};
    for (const [cat, list] of Object.entries(byCategory)) {
      const filtered = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q)
      );
      if (filtered.length) out[cat] = filtered;
    }
    return out;
  }, [byCategory, searchQuery]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const selectAllInCategory = (category: string) => {
    const list = filteredBySearch[category] ?? [];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      list.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const deselectAllInCategory = (category: string) => {
    const list = filteredBySearch[category] ?? [];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      list.forEach((p) => next.delete(p.id));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const idToKey = new Map(permissions.map((p) => [p.id, p.key]));
      const keys = Array.from(selectedIds)
        .map((id) => idToKey.get(id))
        .filter((k): k is string => Boolean(k));
      await api.put(`/admin/users/${userId}/permissions`, { keys });
      setSuccess("Permissions updated successfully");
      setTimeout(() => setSuccess(null), 3000);
      onSave?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update permissions");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-neutral-500 dark:text-neutral-400">Loading permissions...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Search"
            placeholder="Search by name or key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
        {Object.entries(filteredBySearch).map(([category, list]) => {
          const expanded = expandedCategories.has(category);
          const selectedCount = list.filter((p) => selectedIds.has(p.id)).length;
          return (
            <div key={category} className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-2 bg-neutral-50 dark:bg-neutral-800/50 text-left font-medium text-neutral-900 dark:text-neutral-100"
                onClick={() => toggleCategory(category)}
              >
                <span>{category}</span>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {selectedCount} / {list.length}
                </span>
              </button>
              {expanded && (
                <div className="p-2 space-y-1 bg-white dark:bg-neutral-900">
                  <div className="flex gap-2 mb-2">
                    <Button variant="outline" size="sm" onClick={() => selectAllInCategory(category)}>
                      Select all
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => deselectAllInCategory(category)}>
                      Deselect all
                    </Button>
                  </div>
                  {list.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggle(p.id)}
                        className="rounded border-neutral-300 dark:border-neutral-600"
                      />
                      <span className="text-sm font-mono text-neutral-600 dark:text-neutral-400">{p.key}</span>
                      <span className="text-sm text-neutral-900 dark:text-neutral-100">{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
