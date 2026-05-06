import { useState, useCallback } from "react";
import { Wifi, Server, AlertTriangle, Search, RefreshCw, Activity } from "lucide-react";
import { Device, Stats, Alert as AlertType } from "./types";
import { usePolled, apiFetch } from "./hooks/useApi";
import { StatCard } from "./components/StatCard";
import { DeviceTable } from "./components/DeviceTable";
import { DeviceDetail } from "./components/DeviceDetail";
import { AlertBanner } from "./components/AlertBanner";
import { TrafficChart } from "./components/TrafficChart";

type Tab = "devices" | "traffic" | "alerts";

export default function App() {
  const [tab, setTab] = useState<Tab>("devices");
  const [selected, setSelected] = useState<Device | null>(null);
  const [scanning, setScanning] = useState(false);

  const { data: devices, loading: devLoading, refetch: refetchDevices } = usePolled<Device[]>("/devices/?limit=500", 15_000);
  const { data: stats, refetch: refetchStats } = usePolled<Stats>("/stats", 15_000);
  const { data: alerts, refetch: refetchAlerts } = usePolled<AlertType[]>("/alerts/?limit=200", 10_000);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    try {
      await apiFetch("/scans/trigger", { method: "POST" });
      setTimeout(() => { refetchDevices(); refetchStats(); setScanning(false); }, 4000);
    } catch { setScanning(false); }
  }, [refetchDevices, refetchStats]);

  const lastScan = stats?.last_scan
    ? new Date(stats.last_scan).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-200">

      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Activity size={16} className="text-sky-400" />
          </div>
          <div>
            <h1 className="font-bold text-white text-lg leading-none">Network Monitor</h1>
            <p className="text-xs text-slate-500">Calgary House · 192.168.0.0/24</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600">Last scan: {lastScan}</span>
          <button
            onClick={triggerScan}
            disabled={scanning}
            className="flex items-center gap-1.5 text-xs bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={12} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Scan Now"}
          </button>
        </div>
      </header>

      <main className="px-6 py-6 max-w-[1600px] mx-auto space-y-6">

        {/* Stat cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Devices"   value={stats.total_devices}   icon={<Server size={20} />}        accent="blue"  />
            <StatCard label="Online Now"      value={stats.online_devices}  icon={<Wifi size={20} />}          accent="green" />
            <StatCard label="Unknown Devices" value={stats.unknown_devices} icon={<Search size={20} />}        accent="amber" />
            <StatCard label="Unack Alerts"    value={stats.alerts_unack}    icon={<AlertTriangle size={20} />} accent={stats.alerts_unack > 0 ? "red" : "blue"} />
          </div>
        )}

        {/* Alert banner */}
        {alerts && alerts.length > 0 && (
          <AlertBanner alerts={alerts} onAck={() => { refetchAlerts(); refetchStats(); }} />
        )}

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-slate-800">
          {(["devices", "traffic", "alerts"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-sky-500 text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {t}
              {t === "alerts" && stats && stats.alerts_unack > 0 && (
                <span className="ml-1.5 bg-rose-500 text-white text-xs rounded-full w-4 h-4 inline-flex items-center justify-center">
                  {stats.alerts_unack > 9 ? "9+" : stats.alerts_unack}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "devices" && (
          devLoading
            ? <p className="text-slate-600 text-center py-20">Loading devices…</p>
            : <DeviceTable devices={devices ?? []} onSelect={setSelected} />
        )}

        {tab === "traffic" && <TrafficChart />}

        {tab === "alerts" && (
          <div className="space-y-2">
            {(alerts ?? []).length === 0
              ? <p className="text-slate-600 text-center py-10">No alerts.</p>
              : (alerts ?? []).map(a => (
                <div key={a.id} className={`rounded-lg border px-4 py-3 text-sm flex justify-between ${
                  a.acknowledged ? "opacity-40 bg-slate-800/30 border-slate-700" : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}>
                  <span>{a.message ?? a.alert_type}</span>
                  <span className="text-xs opacity-60">{new Date(a.created_at).toLocaleString("en-GB")}</span>
                </div>
              ))
            }
          </div>
        )}

      </main>

      {/* Device detail modal */}
      {selected && <DeviceDetail device={selected} onClose={() => setSelected(null)} />}

    </div>
  );
}
