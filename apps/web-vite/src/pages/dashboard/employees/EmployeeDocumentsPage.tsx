// Human: Company-wide document management page lists all employee documents.
// Managers can add documents (URL-based) and delete them. Filter by type and employee.
// Agent: CALLS GET /employees/documents, GET /employees, POST /employees/:id/documents, DELETE /employees/:id/documents/:doc_id.
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Employee, EmployeeDocument } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

const DOC_TYPES = ["GENERAL", "CONTRACT", "ID", "CERTIFICATE", "NDA", "POLICY", "OFFER_LETTER", "TAX", "OTHER"] as const;

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  ARCHIVED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  EXPIRED:  "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default function EmployeeDocumentsPage() {
  const { can } = useAuth();
  const canView   = can("employees.documents.view") || can("employees.documents.manage");
  const canManage = can("employees.documents.manage");

  const [documents, setDocuments]   = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [loading, setLoading]       = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState<string | null>(null);

  const [typeFilter, setTypeFilter]   = useState("ALL");
  const [search, setSearch]           = useState("");
  const [showForm, setShowForm]       = useState(false);

  const [formEmployee, setFormEmployee] = useState("");
  const [formDocType, setFormDocType]   = useState<string>("GENERAL");
  const [formTitle, setFormTitle]       = useState("");
  const [formUrl, setFormUrl]           = useState("");
  const [formFileName, setFormFileName] = useState("");
  const [formDesc, setFormDesc]         = useState("");
  const [formExpires, setFormExpires]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "ALL") params.set("doc_type", typeFilter);
      const [docData, empData] = await Promise.all([
        api.get<{ documents: EmployeeDocument[] }>(`/employees/documents?${params.toString()}`),
        api.get<{ employees: Employee[] }>("/employees"),
      ]);
      setDocuments(docData.documents ?? []);
      setEmployees(empData.employees ?? []);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { void load(); }, [load]);

  if (!canView) {
    return <AccessDeniedWarning message="You don't have access to employee documents." primaryHref={ROUTES.DASHBOARD} primaryLabel="Back to Dashboard" />;
  }

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setSubmitting(key);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(null);
    }
  };

  const submitDoc = (event: FormEvent) => {
    event.preventDefault();
    if (!formEmployee || !formTitle) return;
    void runAction("create", () =>
      api.post(`/employees/${formEmployee}/documents`, {
        doc_type: formDocType,
        title: formTitle,
        description: formDesc || null,
        url: formUrl || null,
        file_name: formFileName || null,
        expires_at: formExpires || null,
      })
    ).then(() => {
      setShowForm(false);
      setFormEmployee(""); setFormTitle(""); setFormUrl(""); setFormFileName(""); setFormDesc(""); setFormExpires("");
    });
  };

  const q = search.trim().toLowerCase();
  const filtered = documents.filter((d) => {
    if (!q) return true;
    return (d.title + " " + (d.employee_name ?? "") + " " + d.doc_type).toLowerCase().includes(q);
  });

  const inputClass = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Documents</h1>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            Contracts, IDs, certifications and other employee files
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Add document"}
          </Button>
        )}
      </div>

      {showForm && canManage && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">New document</h2>
          <form onSubmit={submitDoc} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Employee
                <select className={`mt-1 ${inputClass}`} value={formEmployee} onChange={(e) => setFormEmployee(e.target.value)} required>
                  <option value="">Select employee…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.display_name ?? `${emp.first_name} ${emp.last_name}`} ({emp.employee_code})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Document type
              <select className={`mt-1 ${inputClass}`} value={formDocType} onChange={(e) => setFormDocType(e.target.value)}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Title*
              <input className={`mt-1 ${inputClass}`} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Employment contract" required />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              File URL
              <input className={`mt-1 ${inputClass}`} value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://…" />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              File name
              <input className={`mt-1 ${inputClass}`} value={formFileName} onChange={(e) => setFormFileName(e.target.value)} placeholder="contract.pdf" />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Expiry date
              <input type="date" className={`mt-1 ${inputClass}`} value={formExpires} onChange={(e) => setFormExpires(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 md:col-span-2">
              Description
              <input className={`mt-1 ${inputClass}`} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Optional description" />
            </label>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting === "create"}>
                {submitting === "create" ? "Saving…" : "Add document"}
              </Button>
            </div>
          </form>
        </section>
      )}

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, employee…"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="ALL">All types</option>
          {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-neutral-500 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
          No documents found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((doc) => (
            <div key={doc.id} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-neutral-900 dark:text-neutral-100">{doc.title}</p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{doc.employee_name ?? doc.employee_id}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[doc.status] ?? STATUS_STYLE.ACTIVE}`}>
                    {doc.status}
                  </span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    {doc.doc_type.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
              {doc.description && <p className="text-xs text-neutral-600 dark:text-neutral-400">{doc.description}</p>}
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span>{doc.file_name ?? "No file name"}</span>
                {doc.expires_at && <span>Expires {doc.expires_at}</span>}
              </div>
              <div className="flex items-center gap-2">
                {doc.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    Open file ↗
                  </a>
                )}
                {canManage && (
                  <button
                    type="button"
                    disabled={submitting === `del-${doc.id}`}
                    onClick={() => {
                      if (!window.confirm("Delete this document?")) return;
                      void runAction(`del-${doc.id}`, () => api.delete(`/employees/${doc.employee_id}/documents/${doc.id}`));
                    }}
                    className="ml-auto text-xs text-red-500 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    {submitting === `del-${doc.id}` ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
