import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { AdguardStats } from "../types";

interface Props {
  stats: AdguardStats | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export function TrafficChart({ stats, loading, error, onRetry }: Props) {
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
          Check that the API can reach AdGuard and that <code className="text-slate-400">ADGUARD_URL</code> / credentials in <code className="text-slate-400">.env</code> are correct.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-xs text-sky-400 hover:text-sky-300 underline"
          >
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

  const top10Clients = (stats.top_clients ?? []).slice(0, 10).map(c => ({
    name: String(c.name).length > 22 ? String(c.name).slice(0, 22) + "…" : String(c.name),
    queries: c.count,
  }));

  const top10Blocked = (stats.top_blocked_domains ?? []).slice(0, 10).map(d => ({
    name: d.name.length > 28 ? d.name.slice(0, 28) + "…" : d.name,
    blocked: d.count,
  }));

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
    </div>
  );
}
