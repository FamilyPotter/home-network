import { useEffect, useState } from "react";
import { X, Wifi, Cable, Shield, ChevronDown, ChevronRight } from "lucide-react";
import { Device, AdguardStats } from "../types";
import { apiFetch } from "../hooks/useApi";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CATEGORY_COLORS, CategoryBadge } from "./CategoryBadge";

interface Props {
  device: Device;
  onClose: () => void;
}

/** Extract readable IP strings from an AdGuard answer field (may be array or string). */
function formatAnswer(answer: unknown): string {
  if (!answer) return "";
  if (typeof answer === "string") {
    // Already stringified JSON array from the DB — try to parse IPs out
    try {
      const parsed = JSON.parse(answer);
      if (Array.isArray(parsed)) {
        return parsed
          .map((a) => (typeof a === "object" && a !== null ? a.value ?? JSON.stringify(a) : String(a)))
          .filter(Boolean)
          .join(", ");
      }
    } catch {
      // Not JSON — treat as plain string
    }
    return answer;
  }
  if (Array.isArray(answer)) {
    return answer
      .map((a) => (typeof a === "object" && a !== null ? (a as { value?: string }).value ?? JSON.stringify(a) : String(a)))
      .filter(Boolean)
      .join(", ");
  }
  return String(answer);
}

interface LiveEntry {
  qhost?: string;
  question?: { name?: string; type?: string; class?: string };
  answer?: unknown;
  reason?: string;
  status?: string;
  time?: string;
  client?: string;
  elapsedMs?: string;
  upstream?: string;
  rules?: Array<{ text?: string; filter_list_id?: number }>;
  tracker_name?: string | null;
  tracker_category?: string | null;
  tracker_org?: string | null;
}

/** Relative time helper (short form). */
function relTimeShort(dt: string | null | undefined): string {
  if (!dt) return "";
  const diff = Date.now() - new Date(dt).getTime();
  if (diff < 0) return "";
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Colour class for AdGuard reason/status. */
function reasonColor(reason?: string): string {
  if (!reason) return "bg-slate-600";
  if (reason.startsWith("Filtered") || reason.includes("Block")) return "bg-rose-500";
  if (reason === "NotFilteredNotFound" || reason === "NotFilteredWhiteList") return "bg-emerald-500";
  if (reason === "NotFilteredAllowList") return "bg-sky-500";
  return "bg-slate-500";
}

export function DeviceDetail({ device, onClose }: Props) {
  const [agStats, setAgStats] = useState<AdguardStats | null>(null);
  const [queryLog, setQueryLog] = useState<LiveEntry[]>([]);
  const [agLoading, setAgLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<AdguardStats>("/adguard/stats")
      .then((d) => { setAgStats(d); setAgLoading(false); })
      .catch(() => setAgLoading(false));

    if (device.ip) {
      apiFetch<{ data?: LiveEntry[] }>(
        `/adguard/querylog/live?clientid=${encodeURIComponent(device.ip)}&limit=50`
      )
        .then((d) => setQueryLog(d.data ?? []))
        .catch(() => setQueryLog([]));
    }
  }, [device.id, device.ip]);

  const clientStats = agStats?.top_clients?.find((c) => c.name === device.ip);
  const histogram = Array.isArray(agStats?.processing_time_histogram)
    ? agStats!.processing_time_histogram
    : [];
  const histData = histogram.map((v, i) => ({ bin: i, count: typeof v === "number" ? v : 0 }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${device.online ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-slate-600"}`} />
              <h2 className="text-lg font-bold text-white">
                {device.hostname ?? device.mac}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{device.mac}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-4">

          {/* Identity */}
          <div className="col-span-2 bg-slate-800/50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <Field label="IP Address"   value={device.ip ?? "—"} mono />
            <Field label="MAC Address"  value={device.mac} mono />
            <Field label="Manufacturer" value={device.manufacturer ?? "—"} />
            <Field label="Category"     value={device.category ?? "—"} />
            <Field label="Room"         value={device.room ?? "—"} />
            <Field label="Connection"   value={device.connection ?? "—"}
              icon={device.connection === "Wired" ? <Cable size={14} /> : <Wifi size={14} />} />
            <Field label="IP Type"
              value={device.ip_type === "S" ? "Static (OS)" : device.ip_type === "R" ? "DHCP Reserved" : "Dynamic"} />
            <Field label="Known"       value={device.known ? "Yes" : "No"} />
            <Field label="First Seen"  value={fmt(device.first_seen)} />
            <Field label="Last Seen"   value={fmt(device.last_seen)} />
            {device.description && (
              <div className="col-span-2 mt-1">
                <p className="text-xs text-slate-500 mb-1">Description</p>
                <p className="text-slate-300">{device.description}</p>
              </div>
            )}
          </div>

          {/* AdGuard stats */}
          <div className="col-span-2 bg-slate-800/50 rounded-xl p-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
              <Shield size={12} /> AdGuard Query Stats (24 h)
            </h3>
            {agLoading
              ? <p className="text-slate-600 text-sm">Loading…</p>
              : clientStats
                ? <p className="text-slate-300 text-sm">
                    <span className="font-bold text-sky-400">{clientStats.count.toLocaleString()}</span> DNS queries from this device
                  </p>
                : <p className="text-slate-600 text-sm">No recent queries found for {device.ip ?? "this device"}.</p>
            }
            {!agLoading && histData.length > 0 && (
              <div className="mt-3 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histData} margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                    <XAxis dataKey="bin" hide />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                      labelStyle={{ color: "#94a3b8" }}
                      cursor={{ fill: "rgba(148,163,184,0.1)" }}
                    />
                    <Bar dataKey="count" fill="#38bdf8" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-center text-xs text-slate-600 mt-1">DNS response time distribution (network-wide)</p>
              </div>
            )}

            {/* Live query log */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500">Last 50 DNS queries for <span className="font-mono text-sky-400">{device.ip}</span></p>
                <p className="text-xs text-slate-600">Click a row for details</p>
              </div>
              <div className="max-h-80 overflow-auto border border-slate-700 rounded-lg divide-y divide-slate-800">
                {queryLog.length === 0 ? (
                  <p className="text-slate-600 text-sm p-3">No recent per-device query log entries.</p>
                ) : (
                  queryLog.map((q, idx) => {
                    const host = q.question?.name ?? q.qhost ?? "unknown";
                    const ans = formatAnswer(q.answer);
                    const isOpen = expanded === idx;
                    const isBlocked = q.reason?.startsWith("Filtered") ?? false;
                    return (
                      <div key={idx}>
                        {/* Summary row */}
                        <div
                          onClick={() => setExpanded(isOpen ? null : idx)}
                          className="px-3 py-2 text-xs flex items-center gap-2 cursor-pointer hover:bg-slate-800/60 transition-colors"
                        >
                          <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${reasonColor(q.reason)}`} title={q.reason} />
                          <span className={`min-w-0 flex-1 break-all ${isBlocked ? "text-rose-400 line-through opacity-70" : "text-slate-300"}`}>
                            {host}
                          </span>
                          <span className="text-slate-600 shrink-0">{relTimeShort(q.time)}</span>
                          {q.tracker_category && (
                            <CategoryBadge category={q.tracker_category} name={q.tracker_name} />
                          )}
                          <span className="shrink-0 text-slate-600">
                            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </span>
                        </div>

                        {/* Expanded detail */}
                        {isOpen && (
                          <div className="px-3 py-3 bg-slate-800/70 text-xs grid grid-cols-2 gap-x-4 gap-y-2">
                            <DetailRow label="Domain"   value={host} mono />
                            <DetailRow label="Type"     value={q.question?.type ?? "—"} />
                            <DetailRow label="Status"   value={q.status ?? "—"} />
                            <DetailRow label="Reason"   value={q.reason ?? "—"} />
                            {ans && <DetailRow label="Answer" value={ans} mono />}
                            <DetailRow label="Elapsed"  value={q.elapsedMs ? `${q.elapsedMs} ms` : "—"} />
                            <DetailRow label="Time"     value={q.time ? new Date(q.time).toLocaleString("en-GB") : "—"} />
                            {q.upstream && <DetailRow label="Upstream" value={q.upstream} mono />}
                            {q.rules && q.rules.length > 0 && (
                              <div className="col-span-2">
                                <p className="text-slate-500 mb-0.5">Block rule</p>
                                <p className="font-mono text-rose-300 break-all">{q.rules[0].text}</p>
                              </div>
                            )}
                            {/* WhoTracks.me section */}
                            {(q.tracker_name || q.tracker_category || q.tracker_org) && (
                              <div className="col-span-2 mt-1 pt-2 border-t border-slate-700">
                                <p className="text-slate-500 mb-1.5 uppercase tracking-wider text-[10px]">WhoTracks.me</p>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                  {q.tracker_name && <DetailRow label="Tracker"      value={q.tracker_name} />}
                                  {q.tracker_category && (
                                    <div>
                                      <p className="text-slate-500 mb-0.5">Category</p>
                                      <CategoryBadge category={q.tracker_category} name={q.tracker_name} />
                                    </div>
                                  )}
                                  {q.tracker_org && <DetailRow label="Organisation" value={q.tracker_org} />}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-slate-500 mb-0.5">{label}</p>
      <p className={`break-all ${mono ? "font-mono text-sky-300" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-slate-200 flex items-center gap-1 ${mono ? "font-mono text-sky-300" : ""}`}>
        {icon}{value}
      </p>
    </div>
  );
}

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
