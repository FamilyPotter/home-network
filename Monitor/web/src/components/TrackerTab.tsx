import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Shield, ShieldCheck, ShieldAlert, ChevronDown, ChevronRight, Search, X, ExternalLink, Tag, Building2, LayoutGrid } from "lucide-react";
import { apiFetch } from "../hooks/useApi";
import { AdguardQuery, Device } from "../types";

// ── Category style map ─────────────────────────────────────────────────────────
const CAT: Record<string, { bg: string; text: string; border: string; label: string }> = {
  advertising:          { bg: "bg-rose-500/15",    text: "text-rose-300",    border: "border-rose-500/30",    label: "Advertising" },
  site_analytics:       { bg: "bg-sky-500/15",     text: "text-sky-300",     border: "border-sky-500/30",     label: "Analytics" },
  social_media:         { bg: "bg-violet-500/15",  text: "text-violet-300",  border: "border-violet-500/30",  label: "Social Media" },
  cdn:                  { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", label: "CDN" },
  hosting:              { bg: "bg-teal-500/15",    text: "text-teal-300",    border: "border-teal-500/30",    label: "Hosting" },
  customer_interaction: { bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/30",   label: "Support" },
  audio_video_player:   { bg: "bg-orange-500/15",  text: "text-orange-300",  border: "border-orange-500/30",  label: "Media" },
  telemetry:            { bg: "bg-yellow-500/15",  text: "text-yellow-300",  border: "border-yellow-500/30",  label: "Telemetry" },
  consent:              { bg: "bg-slate-500/15",   text: "text-slate-300",   border: "border-slate-600/40",   label: "Consent" },
  essential:            { bg: "bg-blue-500/15",    text: "text-blue-300",    border: "border-blue-500/30",    label: "Essential" },
  email:                { bg: "bg-pink-500/15",    text: "text-pink-300",    border: "border-pink-500/30",    label: "Email" },
  extensions:           { bg: "bg-indigo-500/15",  text: "text-indigo-300",  border: "border-indigo-500/30",  label: "Extensions" },
};
const FALLBACK_CAT = { bg: "bg-slate-500/15", text: "text-slate-400", border: "border-slate-600/40", label: "" };
function cs(cat: string) { return CAT[cat] ?? { ...FALLBACK_CAT, label: cat }; }

// ── WhoTracks.me enrichment level ──────────────────────────────────────────────
type WtmLevel = "full" | "partial" | "minimal";

function wtmLevel(q: TrackerEntry): WtmLevel {
  if (q.tracker_org && q.tracker_category) return "full";
  if (q.tracker_category) return "partial";
  return "minimal";
}

const WTM_LEVEL: Record<WtmLevel, {
  icon: (sz: number) => JSX.Element;
  badge: string;
  label: string;
  title: string;
}> = {
  full: {
    icon: (sz) => <ShieldCheck size={sz} className="text-emerald-400" />,
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    label: "Full",
    title: "Fully enriched by WhoTracks.me — tracker name, category & organisation identified",
  },
  partial: {
    icon: (sz) => <Shield size={sz} className="text-amber-400" />,
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    label: "Partial",
    title: "Partially enriched by WhoTracks.me — tracker name & category identified, organisation unknown",
  },
  minimal: {
    icon: (sz) => <ShieldAlert size={sz} className="text-slate-500" />,
    badge: "bg-slate-700/50 text-slate-400 border-slate-600/40",
    label: "Tracker",
    title: "Minimally enriched by WhoTracks.me — tracker name identified only",
  },
};

// ── WTM Tooltip card ───────────────────────────────────────────────────────────
interface TooltipState { q: TrackerEntry; x: number; y: number; above: boolean }

function wtmUrl(name: string) {
  const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return `https://whotracks.me/trackers/${slug}.html`;
}

function WtmTooltip({ tip, onMouseEnter, onMouseLeave }: {
  tip: TooltipState;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const s   = cs(tip.q.tracker_category);
  const lvl = wtmLevel(tip.q);
  const meta = WTM_LEVEL[lvl];

  // 4px gap so the tooltip is almost touching the button — small enough
  // that the mouse crosses it before the 120ms hide timer fires.
  const style: React.CSSProperties = tip.above
    ? { position: "fixed", left: tip.x, top: tip.y - 4, transform: "translate(-100%, -100%)" }
    : { position: "fixed", left: tip.x, top: tip.y + 4, transform: "translateX(-80%)" };

  return (
    <div
      style={style}
      className="z-50 w-72 rounded-xl border border-slate-600/60 bg-slate-900 shadow-2xl shadow-black/60 text-xs"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700/50 bg-slate-800/60 rounded-t-xl">
        {meta.icon(14)}
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${meta.badge}`}>
          {meta.label} enrichment
        </span>
        <span className="ml-auto text-slate-600 text-[10px]">WhoTracks.me</span>
      </div>

      {/* Fields */}
      <div className="px-3 py-2.5 space-y-2">

        {/* Tracker name */}
        <div className="flex items-start gap-2">
          <Tag size={11} className="text-slate-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Tracker</p>
            <p className="text-slate-200 font-medium">{tip.q.tracker_name}</p>
          </div>
        </div>

        {/* Category */}
        {tip.q.tracker_category && (
          <div className="flex items-start gap-2">
            <LayoutGrid size={11} className="text-slate-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Category</p>
              <span className={`px-2 py-0.5 rounded-full text-[11px] ${s.bg} ${s.text}`}>
                {s.label || tip.q.tracker_category}
              </span>
            </div>
          </div>
        )}

        {/* Organisation */}
        <div className="flex items-start gap-2">
          <Building2 size={11} className="text-slate-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Organisation</p>
            {tip.q.tracker_org
              ? <p className="text-slate-200">{tip.q.tracker_org}</p>
              : <p className="text-slate-600 italic">Unknown</p>}
          </div>
        </div>

        {/* Domain queried */}
        <div className="flex items-start gap-2">
          <Shield size={11} className="text-slate-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Domain queried</p>
            <p className="text-slate-300 font-mono break-all">{tip.q.question ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Footer link */}
      <div className="px-3 pb-2.5">
        <a
          href={wtmUrl(tip.q.tracker_name)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[11px] font-medium bg-slate-700/70 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors"
        >
          <ExternalLink size={10} />
          View on WhoTracks.me
        </a>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

interface TrackerEntry {
  id: number;
  client_ip: string | null;
  question: string | null;
  tracker_name: string;
  tracker_category: string;
  tracker_org: string | null;
  queried_at: string | null;
  status: string | null;
}

interface DeviceGroup {
  ip: string;
  label: string;
  device?: Device;
  queries: TrackerEntry[];
  cats: Record<string, number>;
  wtm: Record<WtmLevel, number>;
}

// ── Component ──────────────────────────────────────────────────────────────────
export function TrackerTab({
  devices,
  filteredDeviceIps,
}: {
  devices: Device[];
  filteredDeviceIps?: Set<string> | null;
}) {
  const [queryLog, setQueryLog] = useState<AdguardQuery[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [wtmTip, setWtmTip]     = useState<TooltipState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTip = useCallback((e: React.MouseEvent, q: TrackerEntry) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const above = rect.top > window.innerHeight / 2;
    setWtmTip({ q, x: rect.right, y: above ? rect.top : rect.bottom, above });
  }, []);

  const hideTip = useCallback(() => {
    hideTimer.current = setTimeout(() => setWtmTip(null), 200);
  }, []);

  useEffect(() => {
    setLoading(true);
    apiFetch<AdguardQuery[]>("/adguard/querylog?limit=1000")
      .then(data => { setQueryLog(data); setLoading(false); })
      .catch(() => { setQueryLog([]); setLoading(false); });
  }, []);

  // All tracker-enriched rows
  const allTracked = useMemo(
    () => queryLog.filter(q => q.tracker_name) as TrackerEntry[],
    [queryLog],
  );

  // All distinct categories present in data
  const allCats = useMemo(
    () => [...new Set(allTracked.map(q => q.tracker_category).filter(Boolean))].sort(),
    [allTracked],
  );

  // Filtered & grouped
  const { groups, totalFiltered } = useMemo(() => {
    let filtered = allTracked;
    if (activeCats.size > 0)
      filtered = filtered.filter(q => activeCats.has(q.tracker_category));
    if (search.trim()) {
      const s = search.toLowerCase();
      filtered = filtered.filter(q =>
        q.question?.toLowerCase().includes(s) ||
        q.tracker_name?.toLowerCase().includes(s) ||
        q.tracker_org?.toLowerCase().includes(s),
      );
    }

    const byIp: Record<string, TrackerEntry[]> = {};
    for (const q of filtered) {
      const ip = q.client_ip ?? "unknown";
      if (filteredDeviceIps && ip !== "unknown" && !filteredDeviceIps.has(ip)) continue;
      (byIp[ip] ??= []).push(q);
    }

    const groups: DeviceGroup[] = Object.entries(byIp)
      .map(([ip, queries]) => {
        const device = devices.find(d => d.ip === ip);
        const cats: Record<string, number> = {};
        const wtm: Record<WtmLevel, number> = { full: 0, partial: 0, minimal: 0 };
        for (const q of queries) {
          cats[q.tracker_category] = (cats[q.tracker_category] ?? 0) + 1;
          wtm[wtmLevel(q)]++;
        }
        return { ip, label: device?.hostname ?? ip, device, queries, cats, wtm };
      })
      .sort((a, b) => b.queries.length - a.queries.length);

    return { groups, totalFiltered: filtered.length };
  }, [allTracked, activeCats, search, devices, filteredDeviceIps]);

  const uniqueTrackers = useMemo(
    () => new Set(allTracked.map(q => q.tracker_name)).size,
    [allTracked],
  );

  const toggleCat = (cat: string) =>
    setActiveCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const toggleExpand = (ip: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(ip) ? n.delete(ip) : n.add(ip); return n; });

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="text-center py-20 text-slate-500 text-sm">Loading tracker data…</div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
    {wtmTip && (
      <WtmTooltip
        tip={wtmTip}
        onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }}
        onMouseLeave={hideTip}
      />
    )}
    <div className="space-y-4">

      {/* Summary bar */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 pb-2 border-b border-slate-800">
        <span>
          <Shield size={11} className="inline mr-1 text-slate-600" />
          Sample: <strong className="text-slate-300">{queryLog.length.toLocaleString()}</strong> queries
        </span>
        <span>Tracker hits: <strong className="text-slate-300">{allTracked.length.toLocaleString()}</strong></span>
        <span>Unique trackers: <strong className="text-slate-300">{uniqueTrackers}</strong></span>
        <span>Devices affected: <strong className="text-slate-300">{new Set(allTracked.map(q => q.client_ip)).size}</strong></span>
        {(activeCats.size > 0 || search) && (
          <span className="text-sky-400 font-medium">
            Filtered: {totalFiltered.toLocaleString()} queries · {groups.length} device{groups.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* WhoTracks.me attribution */}
        <span className="ml-auto flex items-center gap-1.5">
          <ShieldCheck size={11} className="text-emerald-500" />
          <span>Enriched by</span>
          <a
            href="https://whotracks.me"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline inline-flex items-center gap-0.5 transition-colors"
          >
            WhoTracks.me <ExternalLink size={9} className="opacity-70" />
          </a>
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {allCats.map(cat => {
          const s = cs(cat);
          const active = activeCats.has(cat);
          const count  = allTracked.filter(q => q.tracker_category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                active
                  ? `${s.bg} ${s.text} ${s.border}`
                  : "bg-slate-800/50 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              {s.label}
              <span className={`ml-1.5 opacity-70 ${active ? "" : "text-slate-600"}`}>{count}</span>
            </button>
          );
        })}
        {activeCats.size > 0 && (
          <button
            onClick={() => setActiveCats(new Set())}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
          >
            <X size={10} /> Clear
          </button>
        )}

        {/* Search */}
        <div className="ml-auto relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="domain · tracker · org…"
            className="bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-600 w-52"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* WTM enrichment legend */}
      <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-600 py-1">
        <span className="text-slate-500 uppercase tracking-wider">WhoTracks.me enrichment:</span>
        {(["full", "partial", "minimal"] as WtmLevel[]).map(lvl => {
          const meta = WTM_LEVEL[lvl];
          return (
            <span key={lvl} className="flex items-center gap-1" title={meta.title}>
              {meta.icon(11)}
              <span className={`border rounded-full px-1.5 py-px ${meta.badge}`}>{meta.label}</span>
              <span>
                {lvl === "full"    && "— tracker · category · org"}
                {lvl === "partial" && "— tracker · category"}
                {lvl === "minimal" && "— tracker name only"}
              </span>
            </span>
          );
        })}
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm bg-slate-800/30 rounded-xl border border-slate-700/50">
          {allTracked.length === 0
            ? <><p className="font-medium mb-1">No tracker-enriched queries in the current sample</p><p className="text-xs">Queries are matched against WhoTracks.me data as they are polled from AdGuard.</p></>
            : "No results match your filters."
          }
        </div>
      )}

      {/* Device cards */}
      <div className="space-y-2">
        {groups.map(group => {
          const isOpen     = expanded.has(group.ip);
          const sortedCats = Object.entries(group.cats).sort((a, b) => b[1] - a[1]);

          return (
            <div key={group.ip} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">

              {/* Card header (click to toggle) */}
              <button
                type="button"
                onClick={() => toggleExpand(group.ip)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/20 transition-colors"
              >
                <span className="text-slate-500 shrink-0">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>

                {/* Name & IP */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-200 text-sm truncate">{group.label}</p>
                  {group.label !== group.ip && (
                    <p className="text-[10px] text-slate-500 font-mono">{group.ip}</p>
                  )}
                </div>

                {/* Hit count */}
                <span className="shrink-0 text-xs font-bold bg-slate-700 text-slate-200 rounded-full px-2.5 py-0.5 tabular-nums">
                  {group.queries.length}
                </span>

                {/* WTM enrichment coverage pill */}
                {(() => {
                  const fullPct = Math.round((group.wtm.full / group.queries.length) * 100);
                  const level = fullPct >= 80 ? "full" : fullPct >= 40 ? "partial" : "minimal";
                  const meta  = WTM_LEVEL[level];
                  return (
                    <span
                      title={`WhoTracks.me enrichment: ${group.wtm.full} full · ${group.wtm.partial} partial · ${group.wtm.minimal} tracker-only`}
                      className={`hidden sm:inline-flex shrink-0 items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${meta.badge}`}
                    >
                      {meta.icon(10)}
                      WTM {fullPct}%
                    </span>
                  );
                })()}

                {/* Category chips summary */}
                <div className="hidden sm:flex flex-wrap gap-1 justify-end max-w-sm">
                  {sortedCats.slice(0, 6).map(([cat, count]) => {
                    const s = cs(cat);
                    return (
                      <span key={cat} className={`text-[10px] px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                        {s.label} ×{count}
                      </span>
                    );
                  })}
                  {sortedCats.length > 6 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/80 text-slate-400">
                      +{sortedCats.length - 6} more
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded query table */}
              {isOpen && (
                <div className="border-t border-slate-700/50">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-900/40">
                          <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500 font-normal w-20">Time</th>
                          <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500 font-normal">Domain</th>
                          <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500 font-normal">Tracker</th>
                          <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500 font-normal">Category</th>
                          <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500 font-normal">Organisation</th>
                          <th
                            className="px-4 py-2 text-center text-[10px] uppercase tracking-wider text-slate-500 font-normal w-12"
                            title="WhoTracks.me data completeness"
                          >
                            WTM
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.queries.map(q => {
                          const s    = cs(q.tracker_category);
                          const lvl  = wtmLevel(q);
                          const meta = WTM_LEVEL[lvl];
                          const blocked =
                            q.status?.toLowerCase().includes("block") ||
                            q.status?.toLowerCase().includes("filter");
                          return (
                            <tr key={q.id} className="border-t border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                              <td
                                className="px-4 py-1.5 text-slate-500 whitespace-nowrap tabular-nums"
                                title={q.queried_at ?? ""}
                              >
                                {relTime(q.queried_at)}
                              </td>
                              <td className="px-4 py-1.5 font-mono max-w-xs">
                                <span className={blocked ? "line-through text-slate-500" : "text-slate-300"}>
                                  {q.question ?? "—"}
                                </span>
                                {blocked && <span className="ml-1.5 text-rose-400/70 text-[10px] not-italic">blocked</span>}
                              </td>
                              <td className="px-4 py-1.5 text-slate-300 whitespace-nowrap">{q.tracker_name}</td>
                              <td className="px-4 py-1.5 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] ${s.bg} ${s.text}`}>
                                  {s.label}
                                </span>
                              </td>
                              <td className="px-4 py-1.5 text-slate-400 whitespace-nowrap">
                                {q.tracker_org ?? <span className="text-slate-600">—</span>}
                              </td>
                              {/* WTM enrichment indicator — hover for rich tooltip */}
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  type="button"
                                  onMouseEnter={(e) => showTip(e, q)}
                                  onMouseLeave={hideTip}
                                  className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-slate-700/60 transition-colors cursor-pointer"
                                  aria-label="WhoTracks.me enrichment detail"
                                >
                                  {meta.icon(13)}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
    </>
  );
}
