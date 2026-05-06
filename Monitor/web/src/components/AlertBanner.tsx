import { Bell, X } from "lucide-react";
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

  async function ackAll() {
    await apiFetch("/alerts/acknowledge-all", { method: "POST" });
    onAck();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
          <Bell size={12} /> {unack.length} unacknowledged alert{unack.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={ackAll}
          className="text-xs text-slate-500 hover:text-slate-200 underline transition-colors"
        >
          Acknowledge all
        </button>
      </div>
      {unack.slice(0, 5).map(a => (
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
      {unack.length > 5 && (
        <p className="text-xs text-slate-600 text-right">…and {unack.length - 5} more</p>
      )}
    </div>
  );
}
