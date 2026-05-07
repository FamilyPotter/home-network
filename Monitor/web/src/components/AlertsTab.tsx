import { useState, useMemo } from "react";
import { CheckCheck, Check, AlertTriangle, Info, Bell } from "lucide-react";
import { Alert } from "../types";
import { apiFetch } from "../hooks/useApi";

interface Props {
  alerts: Alert[];
  onAck: () => void;
  /** When set, only show alerts for devices whose ID is in this set */
  filteredDeviceIds?: Set<string> | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const SEV_STYLE: Record<string, { icon: JSX.Element; row: string; badge: string }> = {
  warning: {
    icon: <AlertTriangle size={13} className="text-amber-400 shrink-0" />,
    row:   "border-amber-500/20",
    badge: "bg-amber-500/15 text-amber-300",
  },
  error: {
    icon: <AlertTriangle size={13} className="text-rose-400 shrink-0" />,
    row:   "border-rose-500/20",
    badge: "bg-rose-500/15 text-rose-300",
  },
  info: {
    icon: <Info size={13} className="text-sky-400 shrink-0" />,
    row:   "border-sky-500/20",
    badge: "bg-sky-500/15 text-sky-300",
  },
};
function sevStyle(s: string) { return SEV_STYLE[s] ?? SEV_STYLE.info; }

const TYPE_LABEL: Record<string, string> = {
  offline:    "Offline",
  online:     "Online",
  new_device: "New device",
  ip_change:  "IP change",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
function relTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type StatusFilter = "unacked" | "all" | "acked";

// ── Component ──────────────────────────────────────────────────────────────────
export function AlertsTab({ alerts, onAck, filteredDeviceIds }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("unacked");
  const [typeFilter,   setTypeFilter]   = useState<string>("all");
  const [ackingAll,    setAckingAll]    = useState(false);
  const [ackingIds,    setAckingIds]    = useState<Set<number>>(new Set());

  const allTypes = useMemo(
    () => [...new Set(alerts.map(a => a.alert_type))].sort(),
    [alerts],
  );

  const filtered = useMemo(() => {
    return alerts
      .filter(a => !filteredDeviceIds || (a.device_id != null && filteredDeviceIds.has(a.device_id)))
      .filter(a =>
        statusFilter === "all"    ? true :
        statusFilter === "unacked" ? !a.acknowledged :
        a.acknowledged,
      )
      .filter(a => typeFilter === "all" || a.alert_type === typeFilter);
  }, [alerts, statusFilter, typeFilter, filteredDeviceIds]);

  const unackCount = alerts.filter(a => !a.acknowledged).length;

  async function ackOne(id: number) {
    setAckingIds(prev => new Set([...prev, id]));
    try {
      await apiFetch(`/alerts/${id}/acknowledge`, { method: "PATCH" });
      onAck();
    } finally {
      setAckingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function ackAll() {
    setAckingAll(true);
    try {
      await apiFetch("/alerts/acknowledge-all", { method: "POST" });
      onAck();
    } finally {
      setAckingAll(false);
    }
  }

  // ── Stats row ────────────────────────────────────────────────────────────────
  const totalByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of alerts) m[a.alert_type] = (m[a.alert_type] ?? 0) + 1;
    return m;
  }, [alerts]);

  return (
    <div className="space-y-4">

      {/* Summary bar */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 pb-2 border-b border-slate-800">
        <span>
          <Bell size={11} className="inline mr-1 text-slate-600" />
          Total: <strong className="text-slate-300">{alerts.length.toLocaleString()}</strong>
        </span>
        <span>Unacknowledged: <strong className="text-amber-300">{unackCount.toLocaleString()}</strong></span>
        {Object.entries(totalByType).map(([type, count]) => (
          <span key={type}>
            {TYPE_LABEL[type] ?? type}:{" "}
            <strong className="text-slate-300">{count}</strong>
          </span>
        ))}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Status filter tabs */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
          {(["unacked", "all", "acked"] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 transition-colors ${
                statusFilter === s
                  ? "bg-sky-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {s === "unacked" ? `Unacknowledged (${unackCount})` : s === "acked" ? "Acknowledged" : "All"}
            </button>
          ))}
        </div>

        {/* Type filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setTypeFilter("all")}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              typeFilter === "all"
                ? "bg-slate-600 text-slate-100 border-slate-500"
                : "bg-slate-800/50 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-300"
            }`}
          >
            All types
          </button>
          {allTypes.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? "all" : t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                typeFilter === t
                  ? "bg-slate-600 text-slate-100 border-slate-500"
                  : "bg-slate-800/50 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              {TYPE_LABEL[t] ?? t}
              <span className="ml-1.5 text-slate-600">{totalByType[t] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Acknowledge all (only when viewing unacked) */}
        {unackCount > 0 && statusFilter !== "acked" && (
          <button
            onClick={ackAll}
            disabled={ackingAll}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCheck size={12} />
            {ackingAll ? "Acknowledging…" : `Acknowledge all (${unackCount})`}
          </button>
        )}
      </div>

      {/* Result count */}
      <p className="text-xs text-slate-600">
        Showing {filtered.length.toLocaleString()} alert{filtered.length !== 1 ? "s" : ""}
        {filtered.length < alerts.length ? ` of ${alerts.length.toLocaleString()} total` : ""}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-600 text-sm bg-slate-800/30 rounded-xl border border-slate-700/50">
          No alerts match the current filter.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/50 overflow-hidden">
          {/* Sticky header */}
          <div className="grid grid-cols-[1.6rem_1fr_7rem_6rem_5rem] gap-0 bg-slate-900/60 border-b border-slate-700/50 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">
            <span />
            <span>Message</span>
            <span>Type</span>
            <span className="text-right">Time</span>
            <span className="text-right">Status</span>
          </div>

          {/* Scrollable rows */}
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-700/30">
            {filtered.map(a => {
              const s = sevStyle(a.severity);
              const isAckingThis = ackingIds.has(a.id);
              return (
                <div
                  key={a.id}
                  className={`grid grid-cols-[1.6rem_1fr_7rem_6rem_5rem] gap-0 items-center px-3 py-2.5 text-xs transition-colors hover:bg-slate-700/20 border-l-2 ${s.row} ${
                    a.acknowledged ? "opacity-40" : ""
                  }`}
                >
                  {/* Severity icon */}
                  <span className="flex items-center">{s.icon}</span>

                  {/* Message */}
                  <span className={a.acknowledged ? "text-slate-400" : "text-slate-200"}>
                    {a.message ?? a.alert_type}
                  </span>

                  {/* Type badge */}
                  <span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${s.badge}`}>
                      {TYPE_LABEL[a.alert_type] ?? a.alert_type}
                    </span>
                  </span>

                  {/* Time */}
                  <span className="text-right text-slate-500" title={fmt(a.created_at)}>
                    {relTime(a.created_at)}
                  </span>

                  {/* Acknowledge / status */}
                  <span className="text-right">
                    {a.acknowledged ? (
                      <span className="text-slate-600 flex items-center justify-end gap-1">
                        <Check size={11} /> Done
                      </span>
                    ) : (
                      <button
                        onClick={() => ackOne(a.id)}
                        disabled={isAckingThis}
                        title="Acknowledge"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-50 transition-colors"
                      >
                        <Check size={10} />
                        {isAckingThis ? "…" : "Ack"}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
