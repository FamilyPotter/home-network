import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { apiFetch } from "../hooks/useApi";
import { AdguardStats } from "../types";

export function TrafficChart() {
  const [stats, setStats] = useState<AdguardStats | null>(null);

  useEffect(() => {
    const fetch_ = () =>
      apiFetch<AdguardStats>("/adguard/stats").then(setStats).catch(() => null);
    fetch_();
    const t = setInterval(fetch_, 60_000);
    return () => clearInterval(t);
  }, []);

  if (!stats) return (
    <div className="bg-slate-800/50 rounded-xl p-4 text-slate-600 text-sm text-center">
      Loading AdGuard traffic data…
    </div>
  );

  const top10Clients = (stats.top_clients ?? []).slice(0, 10).map(c => ({
    name: c.name,
    queries: c.count,
  }));

  const top10Blocked = (stats.top_blocked_domains ?? []).slice(0, 10).map(d => ({
    name: d.name.length > 28 ? d.name.slice(0, 28) + "…" : d.name,
    blocked: d.count,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* Top DNS clients */}
      <div className="bg-slate-800/50 rounded-xl p-4">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Top DNS Clients (24h)</h3>
        <div className="h-48">
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
        </div>
      </div>

      {/* Top blocked domains */}
      <div className="bg-slate-800/50 rounded-xl p-4">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Top Blocked Domains (24h)</h3>
        <div className="h-48">
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
        </div>
        <div className="mt-2 text-right text-xs text-slate-600">
          {stats.num_blocked_filtering?.toLocaleString()} blocked / {stats.num_dns_queries?.toLocaleString()} total today
        </div>
      </div>
    </div>
  );
}
