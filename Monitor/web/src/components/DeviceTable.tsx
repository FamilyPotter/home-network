import { useState, useMemo } from "react";
import { clsx } from "clsx";
import { Device, SortDir, SortKey } from "../types";

interface Props {
  devices: Device[];
  onSelect: (d: Device) => void;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "status",       label: "Status"       },
  { key: "hostname",     label: "Hostname"      },
  { key: "ip",           label: "IP"            },
  { key: "mac",          label: "MAC"           },
  { key: "manufacturer", label: "Manufacturer"  },
  { key: "category",     label: "Category"      },
  { key: "room",         label: "Room"          },
  { key: "connection",   label: "Connection"    },
  { key: "ip_type",      label: "IP Type"       },
  { key: "known",        label: "Known"         },
  { key: "description",  label: "Description"   },
  { key: "first_seen",   label: "First Seen"    },
  { key: "last_seen",    label: "Last Seen"     },
];

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

function ipSortKey(ip: string | null) {
  if (!ip) return 0;
  return ip.split(".").reduce((acc, n) => acc * 256 + Number(n), 0);
}

export function DeviceTable({ devices, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [filterCat, setFilterCat] = useState("");

  const rooms = useMemo(() => [...new Set(devices.map(d => d.room).filter(Boolean))].sort(), [devices]);
  const cats  = useMemo(() => [...new Set(devices.map(d => d.category).filter(Boolean))].sort(), [devices]);

  const sorted = useMemo(() => {
    let d = [...devices];
    if (search) {
      const q = search.toLowerCase();
      d = d.filter(x =>
        [x.hostname, x.ip, x.mac, x.manufacturer, x.room, x.category].some(v => v?.toLowerCase().includes(q))
      );
    }
    if (filterRoom) d = d.filter(x => x.room === filterRoom);
    if (filterCat)  d = d.filter(x => x.category === filterCat);

    d.sort((a, b) => {
      let va: string | number | boolean | null;
      let vb: string | number | boolean | null;

      if (sortKey === "status") {
        va = a.online ? 1 : 0;
        vb = b.online ? 1 : 0;
      } else if (sortKey === "ip") {
        va = ipSortKey(a.ip);
        vb = ipSortKey(b.ip);
      } else {
        va = a[sortKey as keyof Device] as string | boolean | null;
        vb = b[sortKey as keyof Device] as string | boolean | null;
      }

      if (va === vb) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = va < vb ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return d;
  }, [devices, search, filterRoom, filterCat, sortKey, sortDir]);

  function toggle(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const ipTypeBadge = (t: string | null) => {
    if (t === "S") return <span className="badge badge-blue">Static</span>;
    if (t === "R") return <span className="badge badge-emerald">Reserved</span>;
    return <span className="badge badge-slate">Dynamic</span>;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Search hostname, IP, MAC, room…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
        />
        <select
          value={filterRoom}
          onChange={e => setFilterRoom(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All rooms</option>
          {rooms.map(r => <option key={r}>{r}</option>)}
        </select>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All categories</option>
          {cats.map(c => <option key={c}>{c}</option>)}
        </select>
        <span className="self-center text-xs text-slate-500">{sorted.length} devices</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggle(col.key)}
                  className="px-3 py-3 text-left cursor-pointer select-none hover:text-sky-400 whitespace-nowrap"
                >
                  {col.label}{arrow(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((d, i) => (
              <tr
                key={d.id}
                onClick={() => onSelect(d)}
                className={clsx(
                  "cursor-pointer border-t border-slate-800 transition-colors",
                  i % 2 === 0 ? "bg-slate-900" : "bg-slate-900/50",
                  "hover:bg-slate-700/60",
                )}
              >
                <td className="px-3 py-2">
                  <span className={clsx(
                    "inline-block w-2 h-2 rounded-full",
                    d.online ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-slate-600",
                  )} />
                </td>
                <td className="px-3 py-2 font-medium text-slate-100 whitespace-nowrap">
                  {d.hostname ?? <span className="text-slate-500 italic">Unknown</span>}
                </td>
                <td className="px-3 py-2 font-mono text-sky-300">{d.ip ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-slate-400 text-xs">{d.mac}</td>
                <td className="px-3 py-2 text-slate-300">{d.manufacturer ?? "—"}</td>
                <td className="px-3 py-2">
                  {d.category
                    ? <span className="badge badge-indigo">{d.category}</span>
                    : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{d.room ?? "—"}</td>
                <td className="px-3 py-2">
                  {d.connection === "Wired"
                    ? <span className="badge badge-teal">Wired</span>
                    : d.connection === "Wireless"
                      ? <span className="badge badge-purple">Wi-Fi</span>
                      : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-2">{ipTypeBadge(d.ip_type)}</td>
                <td className="px-3 py-2 text-center">
                  {d.known
                    ? <span className="text-emerald-400">✓</span>
                    : <span className="text-amber-400">?</span>}
                </td>
                <td className="px-3 py-2 text-slate-400 max-w-64 truncate">{d.description ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{fmt(d.first_seen)}</td>
                <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{fmt(d.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="text-center py-10 text-slate-500">No devices match your filters.</p>
        )}
      </div>
    </div>
  );
}
