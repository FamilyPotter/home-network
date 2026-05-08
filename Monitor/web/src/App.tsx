import { useState, useCallback, useMemo, useEffect, Component, ReactNode } from "react";
import { Wifi, Server, AlertTriangle, Search, RefreshCw, Activity, X } from "lucide-react";
import { Device, Stats, Alert as AlertType, AdguardStats } from "./types";
import { usePolled, apiFetch } from "./hooks/useApi";
import { StatCard } from "./components/StatCard";
import { DeviceTable } from "./components/DeviceTable";
import { DeviceDetail } from "./components/DeviceDetail";
import { AlertBanner } from "./components/AlertBanner";
import { TrafficChart } from "./components/TrafficChart";
import { TrackerTab } from "./components/TrackerTab";
import { AlertsTab } from "./components/AlertsTab";
import { SwitchTab } from "./components/SwitchTab";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-rose-700 rounded-2xl p-6 max-w-sm w-full text-center space-y-3">
            <p className="text-rose-400 font-semibold">Something went wrong</p>
            <p className="text-slate-400 text-xs font-mono break-all">
              {(this.state.error as Error).message}
            </p>
            <button
              className="mt-2 text-xs text-sky-400 hover:text-sky-300 underline"
              onClick={() => this.setState({ error: null })}
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type Tab = "devices" | "traffic" | "trackers" | "alerts" | "switch";

/** Must match Monitor API `ALLOWED_SCAN_INTERVAL_SEC`. */
const SCAN_INTERVAL_OPTIONS: { label: string; seconds: number }[] = [
  { label: "1 min", seconds: 60 },
  { label: "3 min", seconds: 180 },
  { label: "5 min", seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
  { label: "1 hr", seconds: 3600 },
  { label: "3 hr", seconds: 10800 },
  { label: "6 hr", seconds: 21600 },
  { label: "12 hr", seconds: 43200 },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("devices");
  const [selected, setSelected] = useState<Device | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanIntervalSec, setScanIntervalSec] = useState<number>(300);
  const [scanIntervalLoading, setScanIntervalLoading] = useState(true);
  const [intervalSaving, setIntervalSaving] = useState(false);

  // ── Global device filter (shared across all tabs) ──────────────────────────
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalRoom,   setGlobalRoom]   = useState("");
  const [globalCat,    setGlobalCat]    = useState("");
  const [globalKnown,  setGlobalKnown]  = useState<"" | "known" | "unknown">("");

  useEffect(() => {
    apiFetch<{ seconds: number }>("/settings/scan-interval")
      .then((r) => setScanIntervalSec(r.seconds))
      .catch(() => setScanIntervalSec(300))
      .finally(() => setScanIntervalLoading(false));
  }, []);

  const { data: devices, loading: devLoading, refetch: refetchDevices } = usePolled<Device[]>("/devices/?limit=500", 15_000);
  const { data: stats, refetch: refetchStats } = usePolled<Stats>("/stats", 15_000);
  const { data: alerts, refetch: refetchAlerts } = usePolled<AlertType[]>("/alerts/?limit=500", 10_000);
  const {
    data: agStats,
    loading: agLoading,
    error: agError,
    refetch: refetchAg,
  } = usePolled<AdguardStats>("/adguard/stats", 60_000);

  const dnsByIp = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of agStats?.top_clients ?? []) {
      if (c?.name != null) m[String(c.name)] = Number(c.count) || 0;
    }
    return m;
  }, [agStats]);

  // ── Filter-derived values ──────────────────────────────────────────────────
  const allDevices = devices ?? [];

  const rooms = useMemo(
    () => [...new Set(allDevices.map(d => d.room).filter(Boolean))].sort() as string[],
    [allDevices],
  );
  const cats = useMemo(
    () => [...new Set(allDevices.map(d => d.category).filter(Boolean))].sort() as string[],
    [allDevices],
  );

  const filteredDevices = useMemo(() => {
    let d = allDevices;
    if (globalSearch) {
      const q = globalSearch.toLowerCase();
      d = d.filter(x =>
        [x.hostname, x.ip, x.mac, x.manufacturer, x.room, x.category]
          .some(v => v?.toLowerCase().includes(q)),
      );
    }
    if (globalRoom)              d = d.filter(x => x.room === globalRoom);
    if (globalCat)               d = d.filter(x => x.category === globalCat);
    if (globalKnown === "unknown") d = d.filter(x => !x.known);
    else if (globalKnown === "known") d = d.filter(x => x.known);
    return d;
  }, [allDevices, globalSearch, globalRoom, globalCat, globalKnown]);

  const hasGlobalFilter = globalSearch !== "" || globalRoom !== "" || globalCat !== "" || globalKnown !== "";

  const filteredDeviceIps = useMemo(
    () => hasGlobalFilter
      ? new Set(filteredDevices.map(d => d.ip).filter(Boolean) as string[])
      : null,
    [filteredDevices, hasGlobalFilter],
  );
  const filteredDeviceIds = useMemo(
    () => hasGlobalFilter
      ? new Set(filteredDevices.map(d => d.id).filter(Boolean) as string[])
      : null,
    [filteredDevices, hasGlobalFilter],
  );

  const triggerScan = useCallback(async () => {
    setScanning(true);
    try {
      await apiFetch("/scans/trigger", { method: "POST" });
      setTimeout(() => { refetchDevices(); refetchStats(); setScanning(false); }, 4000);
    } catch { setScanning(false); }
  }, [refetchDevices, refetchStats]);

  const onScanIntervalChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const sec = Number(e.target.value);
      setIntervalSaving(true);
      try {
        const r = await apiFetch<{ seconds: number }>("/settings/scan-interval", {
          method: "PUT",
          body: JSON.stringify({ seconds: sec }),
        });
        setScanIntervalSec(r.seconds);
      } catch {
        /* keep previous value */
      } finally {
        setIntervalSaving(false);
      }
    },
    [],
  );

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
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <span className="text-xs text-slate-600">Last scan: {lastScan}</span>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="hidden sm:inline">Auto</span>
            <select
              value={scanIntervalSec}
              onChange={onScanIntervalChange}
              disabled={scanIntervalLoading || intervalSaving}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2 py-1.5 min-w-[6.5rem] disabled:opacity-50 cursor-pointer disabled:cursor-wait"
              aria-label="Automatic scan interval"
            >
              {SCAN_INTERVAL_OPTIONS.map((o) => (
                <option key={o.seconds} value={o.seconds}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
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
            <StatCard
              label="Unknown Devices"
              value={stats.unknown_devices}
              icon={<Search size={20} />}
              accent="amber"
              tooltip={`${stats.unknown_devices} device${stats.unknown_devices !== 1 ? "s" : ""} with no inventory entry — click to filter`}
              onClick={() => {
                setGlobalKnown("unknown");
                setTab("devices");
              }}
            />
            <StatCard
              label="Unack Alerts"
              value={stats.alerts_unack}
              icon={<AlertTriangle size={20} />}
              accent={stats.alerts_unack > 0 ? "red" : "blue"}
              tooltip={`${stats.alerts_unack} unacknowledged alert${stats.alerts_unack !== 1 ? "s" : ""} — click to view`}
              onClick={() => setTab("alerts")}
            />
          </div>
        )}

        {/* Alert banner */}
        {alerts && alerts.length > 0 && (
          <AlertBanner alerts={alerts} onAck={() => { refetchAlerts(); refetchStats(); }} />
        )}

        {/* Global filter bar */}
        <div className="flex flex-wrap gap-2 items-center py-1">
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="search"
              placeholder="Search hostname, IP, MAC, room…"
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
          <select
            value={globalRoom}
            onChange={e => setGlobalRoom(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 cursor-pointer"
          >
            <option value="">All rooms</option>
            {rooms.map(r => <option key={r}>{r}</option>)}
          </select>
          <select
            value={globalCat}
            onChange={e => setGlobalCat(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 cursor-pointer"
          >
            <option value="">All categories</option>
            {cats.map(c => <option key={c}>{c}</option>)}
          </select>
          {globalKnown === "unknown" && (
            <button
              onClick={() => setGlobalKnown("")}
              className="flex items-center gap-1 text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:border-amber-500/60 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              title="Remove unknown-only filter"
            >
              Unknown only <X size={10} />
            </button>
          )}
          {globalKnown === "known" && (
            <button
              onClick={() => setGlobalKnown("")}
              className="flex items-center gap-1 text-xs bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:border-sky-500/60 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              title="Remove known-only filter"
            >
              Known only <X size={10} />
            </button>
          )}
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {hasGlobalFilter
              ? <><strong className="text-sky-400">{filteredDevices.length}</strong> of {allDevices.length} devices</>
              : <>{allDevices.length} devices</>
            }
          </span>
          {hasGlobalFilter && (
            <button
              onClick={() => { setGlobalSearch(""); setGlobalRoom(""); setGlobalCat(""); setGlobalKnown(""); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors whitespace-nowrap"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-slate-800">
          {(["devices", "traffic", "trackers", "alerts", "switch"] as Tab[]).map(t => (
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
            : <DeviceTable
                devices={filteredDevices}
                dnsByIp={dnsByIp}
                dnsLoading={agLoading}
                dnsError={agError}
                onSelect={setSelected}
              />
        )}

        {tab === "traffic" && (
          <TrafficChart
            stats={agStats}
            loading={agLoading}
            error={agError}
            onRetry={refetchAg}
            devices={devices ?? []}
            filteredDeviceIps={filteredDeviceIps}
          />
        )}

        {tab === "trackers" && (
          <TrackerTab
            devices={devices ?? []}
            filteredDeviceIps={filteredDeviceIps}
          />
        )}

        {tab === "alerts" && (
          <AlertsTab
            alerts={alerts ?? []}
            onAck={() => { refetchAlerts(); refetchStats(); }}
            filteredDeviceIds={filteredDeviceIds}
          />
        )}

        {tab === "switch" && <SwitchTab />}

      </main>

      {/* Device detail modal */}
      {selected && (
        <ErrorBoundary>
          <DeviceDetail device={selected} onClose={() => setSelected(null)} />
        </ErrorBoundary>
      )}

    </div>
  );
}
