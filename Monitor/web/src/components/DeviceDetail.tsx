import { useEffect, useState } from "react";
import { X, Wifi, Cable, Server, Shield, Clock } from "lucide-react";
import { Device, AdguardStats } from "../types";
import { apiFetch } from "../hooks/useApi";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  device: Device;
  onClose: () => void;
}

export function DeviceDetail({ device, onClose }: Props) {
  const [agStats, setAgStats] = useState<AdguardStats | null>(null);
  const [queryLog, setQueryLog] = useState<Array<{ qhost?: string; question?: { name?: string }; answer?: string }>>([]);
  const [agLoading, setAgLoading] = useState(true);

  useEffect(() => {
    apiFetch<AdguardStats>("/adguard/stats")
      .then(d => { setAgStats(d); setAgLoading(false); })
      .catch(() => setAgLoading(false));
    if (device.ip) {
      apiFetch<{ data?: Array<{ qhost?: string; question?: { name?: string }; answer?: string }> }>(
        `/adguard/querylog/live?clientid=${encodeURIComponent(device.ip)}&limit=50`
      )
        .then((d) => setQueryLog(d.data ?? []))
        .catch(() => setQueryLog([]));
    }
  }, [device.id]);

  const clientStats = agStats?.top_clients?.find(c => c.name === device.ip);
  const histData = (agStats?.processing_time_histogram ?? []).map((v, i) => ({ bin: i, count: v }));

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
            <Field label="IP Address" value={device.ip ?? "—"} mono />
            <Field label="MAC Address" value={device.mac} mono />
            <Field label="Manufacturer" value={device.manufacturer ?? "—"} />
            <Field label="Category" value={device.category ?? "—"} />
            <Field label="Room" value={device.room ?? "—"} />
            <Field label="Connection" value={device.connection ?? "—"}
              icon={device.connection === "Wired" ? <Cable size={14} /> : <Wifi size={14} />} />
            <Field label="IP Type"
              value={device.ip_type === "S" ? "Static (OS)" : device.ip_type === "R" ? "DHCP Reserved" : "Dynamic"} />
            <Field label="Known" value={device.known ? "Yes" : "No"} />
            <Field label="First Seen" value={fmt(device.first_seen)} />
            <Field label="Last Seen" value={fmt(device.last_seen)} />
            {device.description && (
              <div className="col-span-2 mt-1">
                <p className="text-xs text-slate-500 mb-1">Description</p>
                <p className="text-slate-300">{device.description}</p>
              </div>
            )}
          </div>

          {/* AdGuard stats for this client */}
          <div className="col-span-2 bg-slate-800/50 rounded-xl p-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
              <Shield size={12} /> AdGuard Query Stats (24h)
            </h3>
            {agLoading
              ? <p className="text-slate-600 text-sm">Loading…</p>
              : clientStats
                ? <p className="text-slate-300 text-sm"><span className="font-bold text-sky-400">{clientStats.count.toLocaleString()}</span> DNS queries from this device</p>
                : <p className="text-slate-600 text-sm">No recent queries found for {device.ip}.</p>
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
            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-2">Last 50 DNS queries for this device</p>
              <div className="max-h-48 overflow-auto border border-slate-700 rounded-lg">
                {queryLog.length === 0 ? (
                  <p className="text-slate-600 text-sm p-3">No recent per-device query log entries.</p>
                ) : (
                  queryLog.map((q, idx) => (
                    <div key={idx} className="px-3 py-2 border-b border-slate-800 text-xs">
                      <span className="text-slate-300">{q.question?.name ?? q.qhost ?? "unknown"}</span>
                      {q.answer && <span className="text-slate-500"> → {q.answer}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
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
