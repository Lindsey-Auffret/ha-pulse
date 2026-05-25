import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, BarChart, Bar, Cell
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────
interface MfrData {
  name: string;
  total: number;
  categories: { category: string; count: number }[];
  regions: { region: string; count: number }[];
  volumeByMonth: { month: string; count: number }[];
  sentimentTrend: { month: string; score: number; positive: number; negative: number; neutral: number; total: number }[];
  topSources: { source: string; count: number }[];
  recentArticles: { title: string; url: string; sourceCategory: string; publishedAt: string; region: string; country: string }[];
  sentimentSummary: { positive: number; negative: number; neutral: number; score: number };
}

interface CompareData {
  mfrA: MfrData;
  mfrB: MfrData;
}

// ── Constants ──────────────────────────────────────────────────────────────
const MANUFACTURERS = [
  "Apple",
  "Eargo",
  "Fortell",
  "General Industry",
  "Jabra Enhance",
  "Meta",
  "Nuance Audio",
  "Oticon",
  "Phonak",
  "ReSound",
  "Sennheiser",
  "Signia",
  "Sony",
  "Starkey",
  "Widex",
];

const MANUFACTURER_COLORS: Record<string, string> = {
  "Apple":            "#555555",
  "Eargo":            "#8b6ab0",
  "Fortell":          "#e05c97",
  "General Industry": "#6b7280",
  "Jabra Enhance":    "#b87d1c",
  "Meta":             "#0064e0",
  "Nuance Audio":     "#4a90c4",
  "Oticon":           "#cc0077",
  "Phonak":           "#00873e",
  "ReSound":          "#8b0000",
  "Sennheiser":       "#009ee0",
  "Signia":           "#e00000",
  "Sony":             "#111111",
  "Starkey":          "#f5c400",
  "Widex":            "#222222",
};

const CATEGORY_LABELS: Record<string, string> = {
  financial: "Financial",
  regulatory: "Regulatory",
  reimbursement: "Reimbursement",
  clinical: "Clinical",
  industry: "Industry",
  general: "General",
};

const CATEGORY_COLORS: Record<string, string> = {
  financial: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  regulatory: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  reimbursement: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  clinical: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  industry: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function sentimentLabel(score: number): string {
  if (score > 0.3) return "Positive";
  if (score < -0.3) return "Negative";
  return "Neutral";
}

function sentimentColor(score: number): string {
  if (score > 0.3) return "text-emerald-600 dark:text-emerald-400";
  if (score < -0.3) return "text-red-500 dark:text-red-400";
  return "text-amber-500 dark:text-amber-400";
}

function formatMonth(m: string) {
  try { return format(parseISO(m + "-01"), "MMM yy"); } catch { return m; }
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">{children}</div>
  );
}

function StatCard({
  label, value, sub, color
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold tabular-nums" style={{ color: color || "inherit" }}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function MfrPicker({
  value, onChange, exclude, label
}: { value: string; onChange: (v: string) => void; exclude: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-52 h-9 text-sm font-semibold" style={{ borderColor: MANUFACTURER_COLORS[value] + "80", color: MANUFACTURER_COLORS[value] }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MANUFACTURERS.filter(m => m !== exclude).map(m => (
            <SelectItem key={m} value={m}>
              <span style={{ color: MANUFACTURER_COLORS[m] }} className="font-semibold">{m}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PanelHeader({ mfr, color }: { mfr: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
      <span className="font-bold text-sm text-foreground">{mfr}</span>
    </div>
  );
}

function CategoryBars({ data, color }: { data: { category: string; count: number }[]; color: string }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  if (data.length === 0) return <div className="text-xs text-muted-foreground">No data</div>;
  return (
    <div className="space-y-2">
      {data.map(d => (
        <div key={d.category} className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground w-24 shrink-0 text-right">
            {CATEGORY_LABELS[d.category] || d.category}
          </span>
          <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.count / maxCount) * 100}%`, background: color }}
            />
          </div>
          <span className="text-[11px] tabular-nums font-medium text-foreground w-5 text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function RegionBars({ data, color }: { data: { region: string; count: number }[]; color: string }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  if (data.length === 0) return <div className="text-xs text-muted-foreground">No data</div>;
  return (
    <div className="space-y-2">
      {data.slice(0, 6).map(d => (
        <div key={d.region} className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground w-24 shrink-0 text-right truncate">{d.region}</span>
          <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.count / maxCount) * 100}%`, background: color }}
            />
          </div>
          <span className="text-[11px] tabular-nums font-medium text-foreground w-5 text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function RecentArticlesList({ articles }: { articles: MfrData["recentArticles"] }) {
  if (!articles || articles.length === 0) return <div className="text-xs text-muted-foreground">No articles yet</div>;
  return (
    <div className="space-y-2">
      {articles.map((a, i) => {
        const catColor = CATEGORY_COLORS[a.sourceCategory] || CATEGORY_COLORS.general;
        const date = (() => { try { return format(parseISO(a.publishedAt), "dd MMM yy"); } catch { return "—"; } })();
        return (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-secondary/40 rounded-lg p-2.5 hover:bg-secondary transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${catColor}`}>
                {CATEGORY_LABELS[a.sourceCategory] || a.sourceCategory}
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{date}</span>
            </div>
            <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary">
              {a.title}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{a.country || a.region}</p>
          </a>
        );
      })}
    </div>
  );
}

function TopSources({ sources, color }: { sources: { source: string; count: number }[]; color: string }) {
  if (!sources || sources.length === 0) return <div className="text-xs text-muted-foreground">No data</div>;
  return (
    <div className="space-y-1">
      {sources.slice(0, 5).map((s, i) => (
        <div key={i} className="flex items-center justify-between gap-2 py-0.5">
          <span className="text-xs text-muted-foreground truncate">{s.source}</span>
          <span className="text-xs tabular-nums font-semibold shrink-0" style={{ color }}>{s.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold tabular-nums text-foreground">{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function Compare() {
  const [mfrA, setMfrA] = useState("Phonak");
  const [mfrB, setMfrB] = useState("Oticon");

  const { data, isLoading, isError } = useQuery<CompareData>({
    queryKey: ["/api/compare", mfrA, mfrB],
    queryFn: () => apiRequest("GET", `/api/compare?mfrA=${encodeURIComponent(mfrA)}&mfrB=${encodeURIComponent(mfrB)}`).then(r => r.json()),
    enabled: mfrA !== mfrB,
  });

  const colorA = MANUFACTURER_COLORS[mfrA] || "#1a6fc4";
  const colorB = MANUFACTURER_COLORS[mfrB] || "#7c3fa8";

  // Merge volume by month for overlap chart
  const volumeChartData = (() => {
    if (!data) return [];
    const monthsA = new Map((data.mfrA.volumeByMonth || []).map(d => [d.month, d.count]));
    const monthsB = new Map((data.mfrB.volumeByMonth || []).map(d => [d.month, d.count]));
    const allMonths = Array.from(new Set([...monthsA.keys(), ...monthsB.keys()])).sort();
    return allMonths.map(m => ({
      month: formatMonth(m),
      [data.mfrA.name]: monthsA.get(m) || 0,
      [data.mfrB.name]: monthsB.get(m) || 0,
    }));
  })();

  // Merge sentiment trend for overlap chart
  const sentimentChartData = (() => {
    if (!data) return [];
    const sentA = new Map((data.mfrA.sentimentTrend || []).map(d => [d.month, d.score]));
    const sentB = new Map((data.mfrB.sentimentTrend || []).map(d => [d.month, d.score]));
    const allMonths = Array.from(new Set([...sentA.keys(), ...sentB.keys()])).sort();
    return allMonths.map(m => ({
      month: formatMonth(m),
      [data.mfrA.name]: sentA.has(m) ? parseFloat(sentA.get(m)!.toFixed(2)) : null,
      [data.mfrB.name]: sentB.has(m) ? parseFloat(sentB.get(m)!.toFixed(2)) : null,
    }));
  })();

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-foreground leading-none">Manufacturer Comparison</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Side-by-side article volume, sentiment trend & category breakdown</p>
          </div>
          {/* Pickers */}
          <div className="flex items-end gap-4 flex-wrap">
            <MfrPicker value={mfrA} onChange={v => { setMfrA(v); }} exclude={mfrB} label="Manufacturer A" />
            <div className="text-muted-foreground font-bold text-sm pb-2">vs</div>
            <MfrPicker value={mfrB} onChange={v => { setMfrB(v); }} exclude={mfrA} label="Manufacturer B" />
          </div>
        </div>

        {/* Color bars */}
        {data && (
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: colorA }} />
              <span className="text-xs font-semibold" style={{ color: colorA }}>{data.mfrA.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: colorB }} />
              <span className="text-xs font-semibold" style={{ color: colorB }}>{data.mfrB.name}</span>
            </div>
          </div>
        )}
      </div>

      {/* Main scrollable area */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">

        {mfrA === mfrB && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
            Select two different manufacturers to compare.
          </div>
        )}

        {isError && mfrA !== mfrB && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-6 text-center text-sm text-red-600 dark:text-red-400">
            Failed to load comparison data. Please try again.
          </div>
        )}

        {isLoading && mfrA !== mfrB && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
            <Skeleton className="h-52 w-full rounded-xl" />
            <Skeleton className="h-52 w-full rounded-xl" />
          </div>
        )}

        {data && mfrA !== mfrB && (
          <>
            {/* ── KPI Row ─────────────────────────────────────────────────── */}
            <div>
              <SectionLabel>Overview</SectionLabel>
              <div className="grid grid-cols-2 gap-4">
                {/* Col A */}
                <div className="space-y-3">
                  <StatCard
                    label="Total Articles"
                    value={data.mfrA.total}
                    sub={`All time · ${data.mfrA.name}`}
                    color={colorA}
                  />
                  <StatCard
                    label="Avg Sentiment"
                    value={sentimentLabel(data.mfrA.sentimentSummary.score)}
                    sub={`Score: ${data.mfrA.sentimentSummary.score.toFixed(2)}`}
                    color={colorA}
                  />
                  <StatCard
                    label="Top Category"
                    value={CATEGORY_LABELS[data.mfrA.categories[0]?.category] || data.mfrA.categories[0]?.category || "—"}
                    sub={`${data.mfrA.categories[0]?.count ?? "—"} articles`}
                    color={colorA}
                  />
                </div>
                {/* Col B */}
                <div className="space-y-3">
                  <StatCard
                    label="Total Articles"
                    value={data.mfrB.total}
                    sub={`All time · ${data.mfrB.name}`}
                    color={colorB}
                  />
                  <StatCard
                    label="Avg Sentiment"
                    value={sentimentLabel(data.mfrB.sentimentSummary.score)}
                    sub={`Score: ${data.mfrB.sentimentSummary.score.toFixed(2)}`}
                    color={colorB}
                  />
                  <StatCard
                    label="Top Category"
                    value={CATEGORY_LABELS[data.mfrB.categories[0]?.category] || data.mfrB.categories[0]?.category || "—"}
                    sub={`${data.mfrB.categories[0]?.count ?? "—"} articles`}
                    color={colorB}
                  />
                </div>
              </div>
            </div>

            {/* ── Sentiment Breakdown Row ──────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              {[data.mfrA, data.mfrB].map((mfr, idx) => {
                const color = idx === 0 ? colorA : colorB;
                const total = mfr.sentimentSummary.positive + mfr.sentimentSummary.negative + mfr.sentimentSummary.neutral || 1;
                const pct = (n: number) => Math.round((n / total) * 100);
                return (
                  <div key={mfr.name} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                      <span className="text-xs font-semibold text-foreground">{mfr.name} — Sentiment Mix</span>
                    </div>
                    <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-3">
                      <div className="bg-emerald-500" style={{ width: `${pct(mfr.sentimentSummary.positive)}%` }} />
                      <div className="bg-amber-400" style={{ width: `${pct(mfr.sentimentSummary.neutral)}%` }} />
                      <div className="bg-red-400" style={{ width: `${pct(mfr.sentimentSummary.negative)}%` }} />
                    </div>
                    <div className="flex gap-4 text-[10px] text-muted-foreground">
                      <span><span className="text-emerald-600 dark:text-emerald-400 font-semibold">{pct(mfr.sentimentSummary.positive)}%</span> Positive</span>
                      <span><span className="text-amber-500 font-semibold">{pct(mfr.sentimentSummary.neutral)}%</span> Neutral</span>
                      <span><span className="text-red-500 dark:text-red-400 font-semibold">{pct(mfr.sentimentSummary.negative)}%</span> Negative</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Volume Trend (overlapping lines) ─────────────────────────── */}
            <div className="rounded-xl border border-border bg-card p-5">
              <SectionLabel>Article Volume by Month</SectionLabel>
              {volumeChartData.length === 0 ? (
                <div className="text-xs text-muted-foreground py-8 text-center">No monthly data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={volumeChartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey={data.mfrA.name}
                      stroke={colorA}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: colorA }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey={data.mfrB.name}
                      stroke={colorB}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: colorB }}
                      activeDot={{ r: 5 }}
                      connectNulls
                      strokeDasharray="5 3"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Sentiment Trend (overlapping lines) ──────────────────────── */}
            <div className="rounded-xl border border-border bg-card p-5">
              <SectionLabel>Sentiment Score Trend by Month</SectionLabel>
              <p className="text-[10px] text-muted-foreground -mt-1 mb-3">Keyword-based score: positive keywords minus negative keywords per article (averaged per month)</p>
              {sentimentChartData.length === 0 ? (
                <div className="text-xs text-muted-foreground py-8 text-center">No sentiment trend data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={sentimentChartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey={data.mfrA.name}
                      stroke={colorA}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: colorA }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey={data.mfrB.name}
                      stroke={colorB}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: colorB }}
                      activeDot={{ r: 5 }}
                      connectNulls
                      strokeDasharray="5 3"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Category & Region Breakdown ──────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <SectionLabel>Category Breakdown</SectionLabel>
                <div className="space-y-6">
                  <div>
                    <PanelHeader mfr={data.mfrA.name} color={colorA} />
                    <CategoryBars data={data.mfrA.categories} color={colorA} />
                  </div>
                  <div className="border-t border-border pt-5">
                    <PanelHeader mfr={data.mfrB.name} color={colorB} />
                    <CategoryBars data={data.mfrB.categories} color={colorB} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <SectionLabel>Region Breakdown</SectionLabel>
                <div className="space-y-6">
                  <div>
                    <PanelHeader mfr={data.mfrA.name} color={colorA} />
                    <RegionBars data={data.mfrA.regions} color={colorA} />
                  </div>
                  <div className="border-t border-border pt-5">
                    <PanelHeader mfr={data.mfrB.name} color={colorB} />
                    <RegionBars data={data.mfrB.regions} color={colorB} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Recent Articles ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorA }} />
                  <SectionLabel>{data.mfrA.name} — Recent Articles</SectionLabel>
                </div>
                <RecentArticlesList articles={data.mfrA.recentArticles} />
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorB }} />
                  <SectionLabel>{data.mfrB.name} — Recent Articles</SectionLabel>
                </div>
                <RecentArticlesList articles={data.mfrB.recentArticles} />
              </div>
            </div>

            {/* ── Top Sources ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: colorA }} />
                  <SectionLabel>{data.mfrA.name} — Top Sources</SectionLabel>
                </div>
                <TopSources sources={data.mfrA.topSources} color={colorA} />
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: colorB }} />
                  <SectionLabel>{data.mfrB.name} — Top Sources</SectionLabel>
                </div>
                <TopSources sources={data.mfrB.topSources} color={colorB} />
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  );
}
