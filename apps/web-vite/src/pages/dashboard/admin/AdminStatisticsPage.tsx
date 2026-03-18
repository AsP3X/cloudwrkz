import { useState, useEffect } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";

interface AdminStats {
  users: number;
  tickets: number;
  todos: number;
  links: number;
  activeSessions: number;
  openTickets: number;
}

export default function AdminStatisticsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<AdminStats>("/admin/statistics");
        setStats(data);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  if (user?.role !== "ADMIN") {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Failed to load statistics</p>
      </div>
    );
  }

  const cards = [
    { label: "Active Users", value: stats.users, color: "from-blue-500 to-indigo-600", icon: "👥" },
    { label: "Total Tickets", value: stats.tickets, color: "from-amber-500 to-orange-600", icon: "🎫" },
    { label: "Open Tickets", value: stats.openTickets, color: "from-red-500 to-rose-600", icon: "📋" },
    { label: "Total Todos", value: stats.todos, color: "from-green-500 to-emerald-600", icon: "✅" },
    { label: "Total Links", value: stats.links, color: "from-purple-500 to-violet-600", icon: "🔗" },
    { label: "Active Sessions", value: stats.activeSessions, color: "from-teal-500 to-cyan-600", icon: "🔒" },
  ];

  const CARD_CLASS = "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Admin Statistics</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">System-wide overview</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={CARD_CLASS + " p-6 relative overflow-hidden"}>
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${card.color} opacity-10 rounded-full -mr-8 -mt-8`} />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{card.icon}</span>
                <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{card.label}</h3>
              </div>
              <p className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">{card.value.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
