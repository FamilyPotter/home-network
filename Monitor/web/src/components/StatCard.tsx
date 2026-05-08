import { ReactNode } from "react";
import { clsx } from "clsx";

interface Props {
  label: string;
  value: number | string;
  icon: ReactNode;
  accent?: "green" | "blue" | "amber" | "red";
  onClick?: () => void;
  tooltip?: string;
}

const accentMap = {
  green: "text-emerald-400 bg-emerald-400/10 border-emerald-500/30",
  blue:  "text-sky-400    bg-sky-400/10    border-sky-500/30",
  amber: "text-amber-400  bg-amber-400/10  border-amber-500/30",
  red:   "text-rose-400   bg-rose-400/10   border-rose-500/30",
};

const hoverMap = {
  green: "hover:bg-emerald-400/20 hover:border-emerald-500/50",
  blue:  "hover:bg-sky-400/20    hover:border-sky-500/50",
  amber: "hover:bg-amber-400/20  hover:border-amber-500/50",
  red:   "hover:bg-rose-400/20   hover:border-rose-500/50",
};

export function StatCard({ label, value, icon, accent = "blue", onClick, tooltip }: Props) {
  const interactive = Boolean(onClick);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={tooltip}
      onClick={onClick}
      onKeyDown={e => { if (interactive && (e.key === "Enter" || e.key === " ")) onClick?.(); }}
      className={clsx(
        "rounded-xl border p-4 flex items-center gap-4",
        accentMap[accent],
        interactive && [
          "cursor-pointer select-none transition-colors",
          hoverMap[accent],
        ],
      )}
    >
      <div className="text-2xl">{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-widest opacity-70">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {interactive && (
          <p className="text-xs opacity-50 mt-0.5">click to filter</p>
        )}
      </div>
    </div>
  );
}
