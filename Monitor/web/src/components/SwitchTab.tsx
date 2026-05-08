import { RefreshCw, Zap, WifiOff } from "lucide-react";
import { SwitchData, SwitchPort } from "../types";
import { usePolled } from "../hooks/useApi";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function SpeedBadge({ port }: { port: SwitchPort }) {
  if (!port.up) return <span className="text-xs text-slate-600">—</span>;
  const s = port.speed_mbps;
  const label = s === 1000 ? "1 Gbps" : s ? `${s} Mbps` : port.link_status;
  const cls =
    s === 1000 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
    : s === 100 ? "text-sky-400    bg-sky-500/10    border-sky-500/25"
    :             "text-slate-400  bg-slate-600/15  border-slate-600/25";
  const duplex = port.duplex === "Full" ? " FD" : port.duplex === "Half" ? " HD" : "";
  return (
    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}>
      {label}{duplex}
    </span>
  );
}

function PoeBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border font-mono
      ${active
        ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
        : "bg-slate-700/30 text-slate-600 border-slate-700/40"
      }`}>
      <Zap size={9} />PoE
    </span>
  );
}

function PortRow({ port, live }: { port: SwitchPort; live: boolean }) {
  const isUp = port.up;
  return (
    <tr className="border-b border-slate-800 last:border-0">
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-block w-2 h-2 rounded-full ${isUp ? "bg-emerald-400" : "bg-slate-700"}`} />
      </td>
      <td className="px-3 py-2.5 text-center font-mono text-slate-500 text-sm">{port.port}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {port.poe && <PoeBadge active={port.poe && isUp} />}
          <span className={`text-sm font-medium ${isUp ? "text-slate-200" : "text-slate-600"}`}>
            {port.device || <span className="italic">empty</span>}
          </span>
        </div>
        {port.description && port.device && (
          <p className="text-xs text-slate-600 mt-0.5 ml-0">{port.description}</p>
        )}
      </td>
      <td className="px-3 py-2.5">
        <SpeedBadge port={port} />
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 text-right tabular-nums">
        {live && isUp ? fmt(port.tx_good) : "—"}
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 text-right tabular-nums">
        {live && isUp ? fmt(port.rx_good) : "—"}
      </td>
    </tr>
  );
}

export function SwitchTab() {
  const { data, loading, error, refetch } = usePolled<SwitchData>("/switch/ports", 30_000);

  const portsUp   = data?.ports.filter(p => p.up).length  ?? 0;
  const portsDown = data?.ports.filter(p => !p.up).length ?? 0;
  const poeActive = data?.ports.filter(p => p.poe && p.up).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-300">TL-SG108PE</p>
            <a
              href="http://192.168.0.105/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-600 hover:text-sky-400 transition-colors font-mono"
            >
              192.168.0.105 ↗
            </a>
            {data && (
              <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${
                data.live
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                  : "text-amber-400 bg-amber-500/10 border-amber-500/25"
              }`}>
                {data.live ? "live" : "static layout"}
              </span>
            )}
          </div>
          {data && (
            <p className="text-xs text-slate-600 mt-0.5">
              {portsUp} up · {portsDown} down · {poeActive} PoE active
            </p>
          )}
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Static-data notice */}
      {data && !data.live && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-800/40 bg-amber-900/10 px-4 py-3">
          <WifiOff size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-500/80">
            <span className="font-medium text-amber-400">Static layout</span> — the switch blocks management
            connections from the NAS gateway IP (192.168.0.150). Port layout and last-known link speeds
            reflect the known network architecture.{" "}
            <a href="http://192.168.0.105/" target="_blank" rel="noopener noreferrer"
               className="underline hover:text-amber-300">Open switch UI</a> for live data.
          </div>
        </div>
      )}

      {/* API error */}
      {error && (
        <div className="rounded-lg border border-rose-800 bg-rose-900/20 px-4 py-3 text-xs text-rose-400">
          API error — {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-slate-600 text-sm text-center py-16">Loading switch data…</div>
      )}

      {/* Port table */}
      {data && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/60 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-center w-8"></th>
                <th className="px-3 py-2 text-center w-10">Port</th>
                <th className="px-3 py-2 text-left">Device</th>
                <th className="px-3 py-2 text-left">Link</th>
                <th className="px-3 py-2 text-right">Tx pkts</th>
                <th className="px-3 py-2 text-right">Rx pkts</th>
              </tr>
            </thead>
            <tbody>
              {data.ports.map(p => <PortRow key={p.port} port={p} live={data.live} />)}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-700">
        {data?.live
          ? "Live data from switch web UI · cached 30 s · counters reset on reboot"
          : "Architecture data · packet counters not available without direct switch access"}
      </p>
    </div>
  );
}
