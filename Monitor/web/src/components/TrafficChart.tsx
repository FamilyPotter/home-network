import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";
import { AdguardStats, AdguardQuery, Device } from "../types";
import { apiFetch } from "../hooks/useApi";
import { CATEGORY_COLORS } from "./CategoryBadge";

interface Props {
  stats: AdguardStats | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  devices?: Device[];
  /** When set, only clients whose IP is in this set appear in the DNS-clients chart */
  filteredDeviceIps?: Set<string> | null;
}

interface CategoryCount { category: string; label: string; count: number; color: string }

/** Collapse to registrable domain (last two labels). */
function shortDomain(fqdn: string): string {
  const parts = fqdn.replace(/\.$/, "").split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : fqdn;
}

/** Label for X-axis — device hostname or last-two IP octets. */
function clientLabel(ip: string, devices: Device[]): string {
  const dev = devices.find((d) => d.ip === ip);
  if (dev?.hostname) {
    const name = dev.hostname.replace(/\s*[—–-].*$/, "").trim();
    return name.length > 14 ? name.slice(0, 13) + "…" : name;
  }
  return "." + ip.split(".").slice(-2).join(".");
}

// Colour palettes
const DOMAIN_PALETTE = [
  "#38bdf8", "#34d399", "#fb923c", "#a78bfa",
  "#f87171", "#fbbf24", "#2dd4bf", "#f472b6",
];
const OTHER_COLOR = "#475569";

const BLOCKED_PALETTE = [
  "#f87171", "#fb923c", "#fbbf24", "#a3e635",
  "#34d399", "#22d3ee", "#60a5fa", "#a78bfa",
  "#f472b6", "#94a3b8",
];

// ── Custom tooltips ────────────────────────────────────────────────────────────

function ClientTooltip({ active, payload, label }: {
  active?: boolean; payload?: { dataKey: string; value: number; fill: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null;
  const nonZero = [...payload]
    .filter((p) => Number(p.value) > 0)
    .sort((a, b) => Number(b.value) - Number(a.value));
  const total = nonZero.reduce((s, p) => s + Number(p.value), 0);
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs shadow-xl max-w-xs">
      <p className="font-semibold text-slate-100 mb-1">{label}</p>
      <p className="text-slate-400 mb-2">
        {total.toLocaleString()} queries in sample
      </p>
      {nonZero.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.fill }} />
          <span className="text-slate-400 truncate">{p.dataKey}</span>
          <span className="ml-auto font-medium text-slate-200 pl-3">{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function BlockedTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; payload: { fill?: string } }[]; label?: string
}) {
  if (!active || !payload?.length) return null;
  const val = Number(payload[0]?.value ?? 0);
  const fill = payload[0]?.payload?.fill;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs shadow-xl max-w-xs">
      <div className="flex items-center gap-2 mb-1">
        {fill && <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: fill }} />}
        <span className="font-semibold text-slate-100 break-all">{label}</span>
      </div>
      <p className="text-slate-300">{val.toLocaleString()} blocks (24 h)</p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrafficChart({ stats, loading, error, onRetry, devices = [], filteredDeviceIps }: Props) {
  const [queryLog, setQueryLog] = useState<AdguardQuery[]>([]);

  useEffect(() => {
    apiFetch<AdguardQuery[]>("/adguard/querylog?limit=1000")
      .then(setQueryLog)
      .catch(() => setQueryLog([]));
  }, []);

  // ── Stacked client data — derived entirely from queryLog ───────────────────
  const { stackedClientData, topDomains } = useMemo(() => {
    const clientMap: Record<string, Record<string, number>> = {};
    const clientTotals: Record<string, number> = {};
    const domainTotals: Record<string, number> = {};

    for (const q of queryLog) {
      const client = q.client_ip;
      const raw    = q.question;
      if (!client || !raw) continue;
      if (filteredDeviceIps && !filteredDeviceIps.has(client)) continue;
      const domain = shortDomain(raw);
      clientMap[client] ??= {};
      clientMap[client][domain] = (clientMap[client][domain] ?? 0) + 1;
      clientTotals[client]      = (clientTotals[client] ?? 0) + 1;
      domainTotals[domain]      = (domainTotals[domain] ?? 0) + 1;
    }

    // Top 10 clients by query count within the sample
    const topClients = Object.entries(clientTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip]) => ip);

    // Top 7 domains globally
    const topDomains = Object.entries(domainTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([d]) => d);

    const stackedClientData = topClients.map((ip) => {
      const label     = clientLabel(ip, devices);
      const domCounts = clientMap[ip] ?? {};
      const row: Record<string, string | number> = { name: label };
      let other = 0;
      for (const [dom, cnt] of Object.entries(domCounts)) {
        if (topDomains.includes(dom)) {
          row[dom] = ((row[dom] as number) ?? 0) + cnt;
        } else {
          other += cnt;
        }
      }
      if (other > 0) row["Other"] = other;
      for (const d of topDomains) {
        if (!(d in row)) row[d] = 0;
      }
      return row;
    });

    return { stackedClientData, topDomains };
  }, [queryLog, devices, filteredDeviceIps]);

  // ── Tracker category data ──────────────────────────────────────────────────
  const { categoryData, trackedTotal } = useMemo(() => {
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
      .map(([cat, count]) => ({
        category: cat,
        label: CATEGORY_COLORS[cat]?.label ?? cat,
        count,
        color: catColorHex(cat),
      }));
    return { categoryData, trackedTotal };
  }, [queryLog]);

  // ── Top blocked domains — colour each bar differently ─────────────────────
  const top10Blocked = (stats?.top_blocked_domains ?? []).slice(0, 10).map((d, i) => ({
    name:  d.name.length > 30 ? d.name.slice(0, 29) + "…" : d.name,
    blocked: d.count,
    fill:  BLOCKED_PALETTE[i % BLOCKED_PALETTE.length],
  }));

  // ── Shared axis props ──────────────────────────────────────────────────────
  const xAxisProps = {
    tick:        { fontSize: 10, fill: "#64748b" },
    angle:       -38 as const,
    textAnchor:  "end" as const,
    interval:    0,
    height:      60,
  };

  // ── Render states ──────────────────────────────────────────────────────────
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
        {onRetry && (
          <button type="button" onClick={onRetry}
            className="mt-3 text-xs text-sky-400 hover:text-sky-300 underline">
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

  return (
    <div className="space-y-4">

      {/* Summary row */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span>Total DNS: <strong className="text-slate-300">{stats.num_dns_queries?.toLocaleString() ?? "—"}</strong></span>
        <span>Blocked: <strong className="text-slate-300">{stats.num_blocked_filtering?.toLocaleString() ?? "—"}</strong></span>
        {trackedTotal > 0 && (
          <span>
            Tracker-labelled: <strong className="text-slate-300">{trackedTotal.toLocaleString()}</strong>
            {" "}of{" "}<strong className="text-slate-300">{queryLog.length.toLocaleString()}</strong> cached
          </span>
        )}
      </div>

      {/* ── Chart 1: Top DNS clients — stacked by domain ──────────────────── */}
      <div className="bg-slate-800/50 rounded-xl p-4">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-0.5">Top DNS clients</h3>
        <p className="text-[10px] text-slate-600 mb-3">
          stacked by destination domain · sample of {queryLog.length.toLocaleString()} cached queries
        </p>
        <div className="h-64">
          {stackedClientData.length === 0 ? (
            <p className="text-slate-600 text-sm pt-14 text-center">No client data in query log yet</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackedClientData} margin={{ top: 4, bottom: 2, left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" {...xAxisProps} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip content={<ClientTooltip />} cursor={{ fill: "rgba(148,163,184,0.07)" }} />
                {topDomains.map((domain, i) => (
                  <Bar key={domain} dataKey={domain} stackId="a"
                    fill={DOMAIN_PALETTE[i % DOMAIN_PALETTE.length]}
                    radius={i === topDomains.length - 1 ? [2, 2, 0, 0] : undefined}
                  />
                ))}
                {stackedClientData.some((d) => d["Other"]) && (
                  <Bar dataKey="Other" stackId="a" fill={OTHER_COLOR} radius={[2, 2, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {/* Domain colour legend */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {topDomains.map((d, i) => (
            <span key={d} className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="inline-block w-2 h-2 rounded-sm shrink-0"
                style={{ background: DOMAIN_PALETTE[i % DOMAIN_PALETTE.length] }} />
              {d}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: OTHER_COLOR }} />
            Other
          </span>
        </div>
      </div>

      {/* ── Chart 2: Top blocked domains ──────────────────────────────────── */}
      <div className="bg-slate-800/50 rounded-xl p-4">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-0.5">Top blocked domains</h3>
        <p className="text-[10px] text-slate-600 mb-3">
          {stats.num_blocked_filtering?.toLocaleString() ?? 0} blocked / {stats.num_dns_queries?.toLocaleString() ?? 0} total (24 h)
        </p>
        <div className="h-64">
          {top10Blocked.length === 0 ? (
            <p className="text-slate-600 text-sm pt-14 text-center">No blocked-domain data</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10Blocked} margin={{ top: 4, bottom: 2, left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" {...xAxisProps} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip content={<BlockedTooltip />} cursor={{ fill: "rgba(148,163,184,0.07)" }} />
                <Bar dataKey="blocked" radius={[3, 3, 0, 0]}>
                  {top10Blocked.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Chart 3: Tracker categories ───────────────────────────────────── */}
      {categoryData.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">
            Tracker categories
            <span className="ml-2 text-slate-600 normal-case tracking-normal">
              (WhoTracks.me · cached query log)
            </span>
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical"
                margin={{ top: 0, bottom: 0, left: 70, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis type="category" dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }} width={68} />
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
