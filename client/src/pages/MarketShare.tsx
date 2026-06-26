/**
 * MarketShare.tsx — HA market share by manufacturer, region, and Tier 1 country clusters
 * Data: revenue-based, prescription wholesale segment only, FY2025
 * All figures estimated — no single public anchor (WSA and Starkey are private).
 */
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ShareEntry {
  manufacturer: string;
  share: number;
  dataQuality: "confirmed" | "estimated";
  color: string;
}

interface RegionData {
  id: string;
  label: string;
  notes?: string;
  shares: ShareEntry[];
}

interface CountryData {
  id: string;
  label: string;
  flag: string;
  note: string;
  shares: ShareEntry[];
}

interface CountryCluster {
  id: string;
  clusterLabel: string;
  countries: CountryData[];
}

interface MarketShareData {
  methodology: string;
  segment: string;
  dataYear: string;
  lastUpdated: string;
  acquisitionAlert?: string;
  regions: RegionData[];
  countryClusters?: CountryCluster[];
  sources: { label: string; url?: string }[];
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ShareEntry;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
      <div className="font-semibold" style={{ color: d.color }}>{d.manufacturer}</div>
      <div className="text-foreground font-bold text-base">{d.share}%</div>
      <div className="text-xs mt-0.5 text-yellow-500">~ Estimated</div>
    </div>
  );
}

// ── Donut Card ────────────────────────────────────────────────────────────────
function DonutChart({ region }: { region: RegionData | CountryData }) {
  const countryData = "flag" in region ? region as CountryData : null;

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          {countryData && (
            <span className="text-xl leading-none">{countryData.flag}</span>
          )}
          <h3 className="font-semibold text-foreground text-base">{region.label}</h3>
        </div>
        {(countryData?.note || (region as RegionData).notes) && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {countryData?.note ?? (region as RegionData).notes}
          </p>
        )}
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={region.shares}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              dataKey="share"
              nameKey="manufacturer"
              paddingAngle={2}
            >
              {region.shares.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.color}
                  opacity={0.85}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="space-y-1.5">
        {region.shares.map((entry, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: entry.color, opacity: 0.85 }}
              />
              <span className="text-xs truncate text-muted-foreground">{entry.manufacturer}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className="text-xs font-bold tabular-nums">{entry.share}%</span>
              <span className="text-[9px] text-yellow-500/80 font-medium">est.</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MarketShare() {
  const { data, isLoading, isError } = useQuery<MarketShareData>({
    queryKey: ["haMarketShare"],
    queryFn: async () => {
      const res = await fetch("./haMarketShare.json");
      if (!res.ok) throw new Error("Failed to load market share data");
      return res.json();
    },
    staleTime: Infinity,
  });

  const globalRegion = data?.regions.find(r => r.id === "global");
  const otherRegions = data?.regions.filter(r => r.id !== "global") ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Share</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prescription hearing aid wholesale segment — manufacturer revenue share, {data?.dataYear ?? "FY2025"}
          </p>
        </div>
        {data && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 max-w-xs text-right">
            Updated {data.lastUpdated}
          </div>
        )}
      </div>

      {/* Acquisition alert */}
      {data?.acquisitionAlert && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 flex gap-3">
          <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-blue-400">M&A Alert: </span>
            {data.acquisitionAlert}
          </div>
        </div>
      )}

      {/* Methodology banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3 flex gap-3">
        <svg className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Methodology: </span>
          {data?.methodology ?? "Revenue-based prescription wholesale market share. All figures estimated from third-party analyst consensus — WS Audiology and Starkey are private companies with no public financials. OTC hearing aids and retail/dispensing chains excluded."}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-80 animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
          Failed to load market share data.
        </div>
      )}

      {data && (
        <>
          {/* Global + summary bar */}
          {globalRegion && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-1">
                <DonutChart region={globalRegion} />
              </div>
              {/* Global summary cards */}
              <div className="lg:col-span-2 grid grid-cols-2 gap-4 content-start">
                <div className="text-xs text-muted-foreground mb-1 col-span-2 font-semibold uppercase tracking-wider px-1">
                  Global Revenue Share — Prescription Wholesale
                </div>
                {globalRegion.shares.map((entry, i) => (
                  <div
                    key={i}
                    className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2"
                    style={{ borderLeftColor: entry.color, borderLeftWidth: 3 }}
                  >
                    <div className="text-sm font-semibold text-foreground">{entry.manufacturer}</div>
                    <div className="text-3xl font-bold tabular-nums" style={{ color: entry.color }}>
                      {entry.share}%
                    </div>
                    <div className="text-xs text-yellow-500">~ Estimated</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regional breakdown */}
          <div className="border-t border-border pt-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">By Region</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {otherRegions.map(region => (
                <DonutChart key={region.id} region={region} />
              ))}
            </div>
          </div>

          {/* Country clusters */}
          {data.countryClusters && data.countryClusters.length > 0 && (
            <div className="border-t border-border pt-2 space-y-8">
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  By Country — Tier 1 Markets
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Key markets only. All competitor shares estimated from country-level analyst and procurement data.
                </p>
              </div>

              {data.countryClusters.map(cluster => (
                <div key={cluster.id}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-2 bg-background">
                      {cluster.clusterLabel}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {cluster.countries.map(country => (
                      <DonutChart key={country.id} region={country} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sources */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Sources</div>
            <ul className="space-y-1">
              {data.sources.map((s, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-muted-foreground/40 shrink-0">·</span>
                  <span>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
                        {s.label}
                      </a>
                    ) : s.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
