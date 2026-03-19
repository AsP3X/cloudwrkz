import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Link as LinkType } from "@/lib/types";

export default function LinkEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [link, setLink] = useState<LinkType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");

  const canViewLinks = can("modules.links.view");

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ link: LinkType }>(`/links/${id}`)
      .then((data) => {
        if (!cancelled) {
          setLink(data.link);
          setTitle(data.link.title);
          setUrl(data.link.url);
          setDescription(data.link.description ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) setLink(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link) return;
    setError(null);
    setSaving(true);
    try {
      await api.put(`/links/${id}`, {
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
      });
      navigate(`${ROUTES.DASHBOARD}/links/${link.id}`);
    } catch (err: unknown) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to update link.");
    } finally {
      setSaving(false);
    }
  };

  if (!canViewLinks || (!loading && !link)) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Link not found</h2>
        <Link to={ROUTES.LINKS}>
          <Button variant="primary">Back to Links</Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`${ROUTES.DASHBOARD}/links/${id}`}>
          <Button variant="outline" size="sm">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Link
          </Button>
        </Link>
      </div>
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Edit Link</h1>
        {error && (
          <div className="rounded-lg bg-error-50 dark:bg-error-950/50 border-2 border-error-200 dark:border-error-800 p-4 mb-4">
            <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Input label="URL" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Description</label>
            <textarea
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-neutral-900 dark:text-neutral-100 min-h-[120px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" variant="primary" loading={saving} disabled={saving}>
              Save
            </Button>
            <Link to={`${ROUTES.DASHBOARD}/links/${id}`}>
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
