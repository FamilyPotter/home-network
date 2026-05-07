import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { Alert } from "../types";
import { apiFetch } from "../hooks/useApi";
import { clsx } from "clsx";

interface Props {
  alerts: Alert[];
  onAck: () => void;
}

const sevColour = (s: string) =>
  s === "warning" ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
    : s === "error" ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
    : "border-sky-500/30 bg-sky-500/10 text-sky-300";

export function AlertBanner({ alerts, onAck }: Props) {
  const unack = alerts.filter(a => !a.acknowledged);
  if (unack.length === 0) return null;

  const [acking, setAcking] = useState(false);

  async function ackAll() {
    setAcking(true);
    try {
      await apiFetch("/alerts/acknowledge-all", { method: "POST" });
      onAck();
    } finally {
      setAcking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
          <Bell size={12} /> {unack.length} unacknowledged alert{unack.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={ackAll}
          disabled={acking}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <CheckCheck size={12} />
          {acking ? "Acknowledging…" : "Acknowledge all"}
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
        {unack.map(a => (
          <div
            key={a.id}
            className={clsx("rounded-lg border px-3 py-2 text-sm flex items-start justify-between gap-2", sevColour(a.severity))}
          >
            <span>{a.message ?? a.alert_type}</span>
            <span className="text-xs opacity-60 whitespace-nowrap shrink-0">
              {new Date(a.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
