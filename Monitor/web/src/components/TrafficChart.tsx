import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";
import { AdguardStats, AdguardQuery } from "../types";
import { apiFetch } from "../hooks/useApi";
import { CATEGORY_COLORS } from "./CategoryBadge";

interface Props {
  stats: AdguardStats | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

interface CategoryCount { category: string; label: string; count: number; color: string }

export function TrafficChart({ stats, loading, error, onRetry }: Props) {
  const [queryLog, setQueryLog] = useState<AdguardQuery[]>([]);

  useEffect(() => {
    apiFetch<AdguardQuery[]>("/adguard/querylog?limit=1000")
      .then(setQueryLog)
      .catch(() => setQueryLog([]));
  }, []);

  if (loading && !stats) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-8 text-slate-500 text-sm text-center">
        Loading AdGuard traffic data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-6 text-sm text-rose-200">
        <p className="font-medium">Could not load AdGuard stats</p>
        <p className="text-rose-300/80 mt-1 text-xs font-mono break-all">{error}</p>
        <p className="text-slate-500 mt-2 text-xs">
          Check that the API can reach AdGuard and that{" "}
          <code className="text-slate-400">ADGUARD_URL</code> /{" "}
          credentials in <code className="text-slate-400">.env</code> are correct.
        </p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-3 text-xs text-sky-400 hover:text-sky-300 underline">
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 text-slate-500 text-sm text-center">
        No statistics yet.
      </div>
    );
  }

  const top10Clients = (stats.top_clients ?? []).slice(0, 10).map((c) => ({
    name: String(c.name).length > 22 ? String(c.name).slice(0, 22) + "…" : String(c.name),
    queries: c.count,
  }));

  const top10Blocked = (stats.top_blocked_domains ?? []).slice(0, 10).map((d) => ({
    name: d.name.length > 28 ? d.name.slice(0, 28) + "…" : d.name,
    blocked: d.count,
  }));

  // Aggregate tracker categories from cached query log
  const catCounts: Record<string, number> = {};
  for (const q of queryLog) {
    if (q.tracker_category) {
      catCounts[q.tracker_category] = (catCounts[q.tracker_category] ?? 0) + 1;
    }
  }
  const trackedTotal = Object.values(catCounts).reduce((a, b) => a + b, 0);
  const categoryData: CategoryCount[] = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cat, count]) => {
      const style = CATEGORY_COLORS[cat];
      return {
        category: cat,
        label: style?.label ?? cat,
        count,
        color: catColorHex(cat),
      };
    });

  const noCharts = top10Clients.length === 0 && top10Blocked.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span>
          Total DNS:{" "}
          <strong className="text-slate-300">{stats.num_dns_queries?.toLocaleString() ?? "—"}</strong>
        </span>
        <span>
          Blocked:{" "}
          <strong className="text-slate-300">{stats.num_blocked_filtering?.toLocaleString() ?? "—"}</strong>
        </span>
        {stats.time_units && <span>Units: {stats.time_units}</span>}
        {trackedTotal > 0 && (
          <span>
            Tracker-labelled:{" "}
            <strong className="text-slate-300">{trackedTotal.toLocaleString()}</strong>
            {" "}of{" "}
            <strong className="text-slate-300">{queryLog.length.toLocaleString()}</strong>
            {" "}cached queries
          </span>
        )}
      </div>

      {noCharts && (
        <p className="text-slate-500 text-sm text-center py-4 border border-slate-700 rounded-xl bg-slate-800/30">
          AdGuard returned no top clients or blocked domains yet (statistics may be disabled or empty).
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="bg-slate-800/50 rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Top DNS clients</h3>
          <div className="h-48">
            {top10Clients.length === 0 ? (
              <p className="text-slate-600 text-sm pt-8 text-center">No client data</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={top10Clients} margin={{ top: 4, bottom: 0, left: -20, right: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: "rgba(148,163,184,0.1)" }}
                  />
                  <Area type="monotone" dataKey="queries" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Top blocked domains</h3>
          <div className="h-48">
            {top10Blocked.length === 0 ? (
              <p className="text-slate-600 text-sm pt-8 text-center">No blocked-domain breakdown</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={top10Blocked} margin={{ top: 4, bottom: 0, left: -20, right: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: "rgba(148,163,184,0.1)" }}
                  />
                  <Area type="monotone" dataKey="blocked" stroke="#f87171" fill="#f87171" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 text-right text-xs text-slate-600">
            {stats.num_blocked_filtering?.toLocaleString() ?? 0} blocked / {stats.num_dns_queries?.toLocaleString() ?? 0} total
          </div>
        </div>

      </div>

      {/* Tracker category breakdown */}
      {categoryData.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">
            Tracker categories
            <span className="ml-2 text-slate-600 normal-case tracking-normal">(from cached query log · WhoTracks.me data)</span>
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 0, bottom: 0, left: 70, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} width={68} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: "rgba(148,163,184,0.05)" }}
                  formatter={(value: number, _name: string, entry) =>
                    [`${value.toLocaleString()} queries`, entry.payload?.category ?? ""]
                  }
                />
                <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {categoryData.map((c) => (
              <span key={c.category} className="text-xs text-slate-500">
                <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: c.color }} />
                {c.label}: <strong className="text-slate-300">{c.count.toLocaleString()}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

/** Map tracker category key to a hex color for Recharts Cell. */
function catColorHex(cat: string): string {
  const map: Record<string, string> = {
    advertising:          "#f87171",
    site_analytics:       "#38bdf8",
    social_media:         "#a78bfa",
    cdn:                  "#34d399",
    hosting:              "#2dd4bf",
    customer_interaction: "#fbbf24",
    audio_video_player:   "#fb923c",
    telemetry:            "#facc15",
    consent:              "#94a3b8",
    essential:            "#60a5fa",
    email:                "#f472b6",
    extensions:           "#818cf8",
    misc:                 "#64748b",
  };
  return map[cat] ?? "#475569";
}
