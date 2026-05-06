/** Colour-coded badge for Ghostery/WhoTracks.me tracker categories. */

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  advertising:          { bg: "bg-rose-500/20",   text: "text-rose-300",    label: "Advertising"  },
  site_analytics:       { bg: "bg-sky-500/20",     text: "text-sky-300",     label: "Analytics"    },
  social_media:         { bg: "bg-violet-500/20",  text: "text-violet-300",  label: "Social"       },
  cdn:                  { bg: "bg-emerald-500/20", text: "text-emerald-300", label: "CDN"          },
  hosting:              { bg: "bg-teal-500/20",    text: "text-teal-300",    label: "Hosting"      },
  customer_interaction: { bg: "bg-amber-500/20",   text: "text-amber-300",   label: "CX"           },
  audio_video_player:   { bg: "bg-orange-500/20",  text: "text-orange-300",  label: "Media"        },
  telemetry:            { bg: "bg-yellow-500/20",  text: "text-yellow-300",  label: "Telemetry"    },
  consent:              { bg: "bg-slate-500/20",   text: "text-slate-300",   label: "Consent"      },
  essential:            { bg: "bg-blue-500/20",    text: "text-blue-300",    label: "Essential"    },
  email:                { bg: "bg-pink-500/20",    text: "text-pink-300",    label: "Email"        },
  extensions:           { bg: "bg-indigo-500/20",  text: "text-indigo-300",  label: "Extension"    },
  misc:                 { bg: "bg-slate-600/20",   text: "text-slate-400",   label: "Misc"         },
};

const DEFAULT = { bg: "bg-slate-700/40", text: "text-slate-400", label: "Tracker" };

interface Props {
  category: string | null | undefined;
  name?: string | null;
}

export function CategoryBadge({ category, name }: Props) {
  if (!category) return null;
  const key = category.toLowerCase().replace(/\s+/g, "_");
  const style = CATEGORY_COLORS[key] ?? DEFAULT;
  const label = style.label;
  return (
    <span
      className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${style.bg} ${style.text}`}
      title={name ?? label}
    >
      {label}
    </span>
  );
}
