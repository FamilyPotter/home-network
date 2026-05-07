import { useState, useMemo } from "react";
import { clsx } from "clsx";
import { Device, SortDir, SortKey } from "../types";

interface Props {
  /** Already globally-filtered list from App */
  devices: Device[];
  /** Client IP (or AdGuard client label) → DNS query count from AdGuard stats */
  dnsByIp: Record<string, number>;
  dnsLoading?: boolean;
  dnsError?: string | null;
  onSelect: (d: Device) => void;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "status",       label: "Status"       },
  { key: "dns_queries",  label: "DNS"          },
  { key: "hostname",     label: "Hostname"      },
  { key: "last_seen",    label: "Last Seen"     },
  { key: "ip",           label: "IP"            },
  { key: "mac",          label: "MAC"           },
  { key: "manufacturer", label: "Manufacturer"  },
  { key: "category",     label: "Category"      },
  { key: "room",         label: "Room"          },
  { key: "connection",   label: "Connection"    },
  { key: "ip_type",      label: "IP Type"       },
  { key: "known",        label: "Known"         },
  { key: "description",  label: "Description"   },
  { key: "first_seen",   label: "First Seen"    },
];

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

/** Human-readable relative time: "just now", "5 min ago", "3 h ago", "2 days ago". */
function relTime(dt: string | null): string {
  if (!dt) return "—";
  const diffMs = Date.now() - new Date(dt).getTime();
  if (diffMs < 0) return fmt(dt);
  const s = Math.floor(diffMs / 1000);
  if (s < 60)  return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return fmt(dt);
}

function ipSortKey(ip: string | null) {
  if (!ip) return 0;
  return ip.split(".").reduce((acc, n) => acc * 256 + Number(n), 0);
}

function dnsCount(ip: string | null, dnsByIp: Record<string, number>): number {
  if (!ip) return 0;
  const v = dnsByIp[ip];
  return typeof v === "number" ? v : 0;
}

/** Traffic intensity vs peers for colour dot (DNS-only; LAN throughput not available here). */
function dnsHeatDotClass(count: number, maxAmongPeers: number): string {
  if (count <= 0) return "bg-slate-600";
  const r = maxAmongPeers > 0 ? count / maxAmongPeers : 0;
  if (r < 0.12) return "bg-slate-500";
  if (r < 0.35) return "bg-sky-400 shadow-[0_0_6px_#38bdf8]";
  if (r < 0.65) return "bg-amber-400 shadow-[0_0_6px_#fbbf24]";
  return "bg-rose-400 shadow-[0_0_8px_#fb7185]";
}

export function DeviceTable({ devices, dnsByIp, dnsLoading, dnsError, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const maxDnsInTable = useMemo(() => {
    let m = 1;
    for (const d of devices) {
      const c = dnsCount(d.ip, dnsByIp);
      if (c > m) m = c;
    }
    return m;
  }, [devices, dnsByIp]);

  const sorted = useMemo(() => {
    let d = [...devices];

    d.sort((a, b) => {
      let va: string | number | boolean | null;
      let vb: string | number | boolean | null;

      if (sortKey === "status") {
        va = a.online ? 1 : 0;
        vb = b.online ? 1 : 0;
      } else if (sortKey === "dns_queries") {
        va = dnsCount(a.ip, dnsByIp);
        vb = dnsCount(b.ip, dnsByIp);
      } else if (sortKey === "ip") {
        va = ipSortKey(a.ip);
        vb = ipSortKey(b.ip);
      } else {
        va = a[sortKey as keyof Device] as string | boolean | null;
        vb = b[sortKey as keyof Device] as string | boolean | null;
      }

      if (va === vb) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = va < vb ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return d;
  }, [devices, sortKey, sortDir, dnsByIp]);

  function toggle(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const ipTypeBadge = (t: string | null) => {
    if (t === "S") return <span className="badge badge-blue">Static</span>;
    if (t === "R") return <span className="badge badge-emerald">Reserved</span>;
    return <span className="badge badge-slate">Dynamic</span>;
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">{sorted.length} device{sorted.length !== 1 ? "s" : ""}</p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggle(col.key)}
                  title={col.key === "dns_queries" ? "DNS queries (AdGuard statistics window). LAN Mbps not tracked." : undefined}
                  className="px-3 py-3 text-left cursor-pointer select-none hover:text-sky-400 whitespace-nowrap"
                >
                  {col.label}{arrow(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((d, i) => (
              <tr
                key={d.id}
                onClick={() => onSelect(d)}
                className={clsx(
                  "cursor-pointer border-t border-slate-800 transition-colors",
                  i % 2 === 0 ? "bg-slate-900" : "bg-slate-900/50",
                  "hover:bg-slate-700/60",
                )}
              >
                <td className="px-3 py-2">
                  <span className={clsx(
                    "inline-block w-2 h-2 rounded-full",
                    d.online ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-slate-600",
                  )} />
                </td>
                <td className="px-3 py-2">
                  {dnsError ? (
                    <span className="text-slate-600 text-xs" title={dnsError}>—</span>
                  ) : dnsLoading && Object.keys(dnsByIp).length === 0 ? (
                    <span className="text-slate-600 text-xs">…</span>
                  ) : (
                    <span className="flex items-center gap-2 min-w-[4.5rem]" title={`DNS queries from AdGuard for ${d.ip ?? "unknown IP"}`}>
                      <span
                        className={clsx(
                          "inline-block w-2 h-2 rounded-full shrink-0",
                          dnsHeatDotClass(dnsCount(d.ip, dnsByIp), maxDnsInTable),
                        )}
                      />
                      <span className="font-mono tabular-nums text-xs text-slate-300">
                        {d.ip ? (dnsCount(d.ip, dnsByIp)).toLocaleString() : "—"}
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-medium text-slate-100 whitespace-nowrap">
                  {d.hostname ?? <span className="text-slate-500 italic">Unknown</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {d.online
                    ? <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Online now
                      </span>
                    : <span className="flex flex-col gap-0.5">
                        <span className="text-slate-300 text-xs font-medium">{relTime(d.last_seen)}</span>
                        <span className="text-slate-500 text-xs">{fmt(d.last_seen)}</span>
                      </span>
                  }
                </td>
                <td className="px-3 py-2 font-mono text-sky-300">{d.ip ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-slate-400 text-xs">{d.mac}</td>
                <td className="px-3 py-2 text-slate-300">{d.manufacturer ?? "—"}</td>
                <td className="px-3 py-2">
                  {d.category
                    ? <span className="badge badge-indigo">{d.category}</span>
                    : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{d.room ?? "—"}</td>
                <td className="px-3 py-2">
                  {d.connection === "Wired"
                    ? <span className="badge badge-teal">Wired</span>
                    : d.connection === "Wireless"
                      ? <span className="badge badge-purple">Wi-Fi</span>
                      : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-2">{ipTypeBadge(d.ip_type)}</td>
                <td className="px-3 py-2 text-center">
                  {d.known
                    ? <span className="text-emerald-400">✓</span>
                    : <span className="text-amber-400">?</span>}
                </td>
                <td className="px-3 py-2 text-slate-400 max-w-64 truncate">{d.description ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{fmt(d.first_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="text-center py-10 text-slate-500">No devices match your filters.</p>
        )}
      </div>
    </div>
  );
}
