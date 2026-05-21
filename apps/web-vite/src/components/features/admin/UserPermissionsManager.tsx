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

type UserPermissionsResponse = {
  permissions?: Array<{ id: string; key: string }>;
  direct?: string[];
  fromGroups?: string[];
  effective?: string[];
  validationWarnings?: string[];
};

export function UserPermissionsManager({
  userId,
  initialPermissionIds = [],
  onSave,
}: UserPermissionsManagerProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialPermissionIds));
  const [directKeys, setDirectKeys] = useState<string[]>([]);
  const [fromGroupsKeys, setFromGroupsKeys] = useState<string[]>([]);
  const [effectiveKeys, setEffectiveKeys] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
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
          api.get<UserPermissionsResponse>(`/admin/users/${userId}/permissions`),
        ]);
        if (cancelled) return;
        const all = allRes.permissions ?? [];
        setPermissions(all);
        setDirectKeys(userRes.direct ?? []);
        setFromGroupsKeys(userRes.fromGroups ?? []);
        setEffectiveKeys(userRes.effective ?? []);
        setValidationWarnings(userRes.validationWarnings ?? []);
        const keyToId = new Map(all.map((p) => [p.key, p.id]));
        const directIds = (userRes.direct ?? [])
          .map((key) => keyToId.get(key))
          .filter((id): id is string => Boolean(id));
        const fallbackIds = (userRes.permissions ?? []).map((p) => p.id);
        const ids = new Set(directIds.length > 0 ? directIds : fallbackIds);
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
      const userRes = await api.get<UserPermissionsResponse>(`/admin/users/${userId}/permissions`);
      setDirectKeys(userRes.direct ?? keys);
      setFromGroupsKeys(userRes.fromGroups ?? []);
      setEffectiveKeys(userRes.effective ?? []);
      setValidationWarnings(userRes.validationWarnings ?? []);
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
      {validationWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Validation warnings</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-800 dark:text-amber-200 space-y-1">
            {validationWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Effective permissions ({effectiveKeys.length})
          </h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Union of direct grants and group inheritance (read-only).
          </p>
          {effectiveKeys.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">None</p>
          ) : (
            <ul className="mt-3 max-h-40 overflow-y-auto space-y-1 text-sm font-mono text-neutral-700 dark:text-neutral-300">
              {effectiveKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            From groups ({fromGroupsKeys.length})
          </h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Inherited via group membership (read-only).
          </p>
          {fromGroupsKeys.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">None</p>
          ) : (
            <ul className="mt-3 max-h-40 overflow-y-auto space-y-1 text-sm font-mono text-neutral-700 dark:text-neutral-300">
              {fromGroupsKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-primary-200 dark:border-primary-800 p-4 bg-primary-50/50 dark:bg-primary-950/20">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Direct grants ({directKeys.length})
        </h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Editable below; saving replaces direct user permissions only.
        </p>
        {directKeys.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {directKeys.map((key) => (
              <li
                key={key}
                className="rounded-md bg-white dark:bg-neutral-900 px-2 py-0.5 text-xs font-mono border border-neutral-200 dark:border-neutral-700"
              >
                {key}
              </li>
            ))}
          </ul>
        )}
      </section>

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
