import { ReactNode } from "react";
import { clsx } from "clsx";

interface Props {
  label: string;
  value: number | string;
  icon: ReactNode;
  accent?: "green" | "blue" | "amber" | "red";
}

const accentMap = {
  green: "text-emerald-400 bg-emerald-400/10 border-emerald-500/30",
  blue:  "text-sky-400    bg-sky-400/10    border-sky-500/30",
  amber: "text-amber-400  bg-amber-400/10  border-amber-500/30",
  red:   "text-rose-400   bg-rose-400/10   border-rose-500/30",
};

export function StatCard({ label, value, icon, accent = "blue" }: Props) {
  return (
    <div className={clsx(
      "rounded-xl border p-4 flex items-center gap-4",
      accentMap[accent],
    )}>
      <div className="text-2xl">{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-widest opacity-70">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}
