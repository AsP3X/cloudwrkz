import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Ticket } from "@/lib/types";
import { formatUserName } from "@/lib/utils/users";
import { TicketListView } from "@/components/features/tickets/TicketListView";
import { TicketViewProvider } from "@/components/features/tickets/TicketViewContext";
import { TicketViewControls } from "@/components/features/tickets/TicketViewControls";

type UserInfo = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export default function UserViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = currentUser?.id === id;

  useEffect(() => {
    if (!id) {
      navigate(ROUTES.DASHBOARD, { replace: true });
      return;
    }
    if (currentUser?.role === "USER" && currentUser.id !== id) {
      navigate(ROUTES.DASHBOARD, { replace: true });
      return;
    }
    let cancelled = false;
    Promise.all([
      api.get<{ user: UserInfo }>(`/admin/users/${id}`).catch(() => ({ user: null })),
      api.get<{ tickets: Ticket[] }>(`/tickets?created_by_id=${id}`).catch(() => ({ tickets: [] })),
    ])
      .then(([userRes, ticketsRes]) => {
        if (cancelled) return;
        const u = "user" in userRes && userRes.user ? userRes.user : null;
        setUser(u);
        setTickets("tickets" in ticketsRes ? ticketsRes.tickets : []);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, currentUser, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">User not found</h2>
        <Link to={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <TicketViewProvider>
      <div className="space-y-6">
        <Link to={ROUTES.DASHBOARD}>
          <Button variant="outline" size="sm">← Back to Dashboard</Button>
        </Link>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            {formatUserName({ name: user.name, email: user.email })}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">{user.email}</p>
          <span className="inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            {user.role}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Tickets {isOwnProfile ? "I created" : "created by this user"}
          </h2>
          <TicketViewControls />
        </div>
        {tickets.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
            <p className="text-neutral-600 dark:text-neutral-400">No tickets yet.</p>
          </div>
        ) : (
          <TicketListView tickets={tickets} />
        )}
      </div>
    </TicketViewProvider>
  );
}
