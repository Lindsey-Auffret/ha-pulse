import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO, subDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Article } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────
interface StatsData {
  total: number;
  newCount: number;
  regionBreakdown: { region: string; count: number }[];
  categoryBreakdown: { category: string; count: number }[];
  topSources: { source: string; count: number }[];
  manufacturerBreakdown: { manufacturer: string; count: number }[];
  last30Days: { date: string; count: number }[];
  lastRefresh: { completedAt: string; status: string; articlesAdded: number } | null;
}

interface ArticlesData {
  articles: Article[];
  total: number;
}

// ── Constants ──────────────────────────────────────────────────────────────
const REGIONS = ["All", "North America", "Europe", "Asia-Pacific", "Latin America", "Middle East & Africa", "Global"];

const COUNTRIES_BY_REGION: Record<string, string[]> = {
  "All": ["All"],
  "North America": ["All", "USA", "Canada"],
  "Europe": ["All", "Europe", "UK", "Germany", "France", "Spain", "Italy", "Netherlands", "Belgium", "Sweden", "Norway", "Denmark"],
  "Asia-Pacific": ["All", "Asia-Pacific", "China", "Japan", "Australia", "India", "South Korea", "Singapore"],
  "Latin America": ["All", "Brazil", "Mexico", "Argentina"],
  "Middle East & Africa": ["All", "Middle East", "Africa", "Saudi Arabia", "UAE"],
  "Global": ["All", "Global"],
};

const MANUFACTURERS = [
  "All",
  // Core prescription brands
  "Phonak",
  "Oticon",
  "Widex",
  "Signia",
  "Starkey",
  "ReSound",
  "Jabra Enhance",
  "Eargo",
  // Peripheral / emerging competitors
  "Fortell",
  "Apple",
  "Nuance Audio",
  "Meta",
  "Sony",
  "Sennheiser",
  "General Industry",
];

const MANUFACTURER_COLORS: Record<string, string> = {
  // Core prescription brands
  "Phonak":           "#1a6fc4",
  "Oticon":           "#7c3fa8",
  "Widex":            "#d4a017",
  "Signia":           "#c85a1e",
  "Starkey":          "#3d9f6b",
  "ReSound":          "#0f8090",
  "Jabra Enhance":    "#b87d1c",
  "Eargo":            "#8b6ab0",
  // Peripheral / emerging competitors
  "Fortell":          "#e05c97",
  "Apple":            "#555555",
  "Nuance Audio":     "#4a90c4",
  "Meta":             "#0064e0",
  "Sony":             "#000000",
  "Sennheiser":       "#009ee0",
  "General Industry": "#6b7280",
};

const CATEGORIES = ["All", "financial", "regulatory", "reimbursement", "clinical", "industry", "general"];

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

const CHART_COLORS = ["#0f8090", "#2da0b0", "#5bbfcc", "#8dd8e2", "#b8eaf0", "#0a5c6a"];
const REGION_COLORS: Record<string, string> = {
  "North America": "#0f8090",
  "Europe": "#2da0b0",
  "Asia-Pacific": "#5bbfcc",
  "Global": "#8dd8e2",
  "Latin America": "#3d9f6b",
  "Middle East & Africa": "#b8906a",
};

// ── Logo SVG ──────────────────────────────────────────────────────────────
function HAPulseLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="HA Pulse logo">
      <path d="M6 26 L6 14 Q6 6 14 6 Q22 6 22 14 L22 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
      <circle cx="22" cy="22" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="22" cy="22" r="1.5" fill="currentColor" />
      <path d="M2 18 Q5 12 8 18 Q11 24 14 18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Theme Toggle ──────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");
  return { theme, toggle };
}

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${accent ? "bg-primary/10 border-primary/20" : "bg-card border-border"}`}>
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── Article Card ──────────────────────────────────────────────────────────
function ArticleCard({ article, onManufacturerClick }: { article: Article; onManufacturerClick?: (mfr: string) => void }) {
  const tags = (() => { try { return JSON.parse(article.tags); } catch { return []; } })();
  const mfrs: string[] = (() => { try { return JSON.parse((article as any).manufacturers || "[]"); } catch { return []; } })();
  const catColor = CATEGORY_COLORS[article.sourceCategory] || CATEGORY_COLORS.general;
  const date = (() => { try { return format(parseISO(article.publishedAt), "dd MMM yyyy"); } catch { return "—"; } })();

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`article-card-${article.id}`}
      className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-md transition-all duration-200 group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${catColor}`}>
            {CATEGORY_LABELS[article.sourceCategory] || article.sourceCategory}
          </span>
          <span className="text-[11px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-medium">
            {article.country === "Global" ? "Global" : `${article.country}`}
          </span>
          {article.isNew && (
            <span className="new-badge text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
              NEW
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{date}</span>
      </div>

      <h3 className="text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors mb-1.5 line-clamp-2">
        {article.title}
      </h3>

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-2">
        {article.summary}
      </p>

      {/* Manufacturer badges */}
      {mfrs.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          {mfrs.map((mfr: string) => (
            <button
              key={mfr}
              onClick={e => { e.preventDefault(); e.stopPropagation(); onManufacturerClick?.(mfr); }}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-opacity hover:opacity-80"
              style={{
                backgroundColor: `${MANUFACTURER_COLORS[mfr] || "#888"}18`,
                color: MANUFACTURER_COLORS[mfr] || "#888",
                borderColor: `${MANUFACTURER_COLORS[mfr] || "#888"}44`,
              }}
              data-testid={`mfr-badge-${mfr.replace(/\s/g, "-")}`}
            >
              {mfr}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 flex-wrap">
          {tags.slice(0, 3).map((tag: string) => (
            <span key={tag} className="text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded font-medium">
              {tag}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground font-medium shrink-0 truncate max-w-[120px]">{article.source}</span>
      </div>
    </a>
  );
}

// ── Region Badge Chip ─────────────────────────────────────────────────────
function RegionChip({ region, count }: { region: string; count: number }) {
  const color = REGION_COLORS[region] || "#888";
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-foreground flex-1 truncate">{region}</span>
      <span className="text-xs tabular-nums text-muted-foreground font-medium">{count}</span>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────
export default function Dashboard() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Filters
  const [region, setRegion] = useState("All");
  const [country, setCountry] = useState("All");
  const [category, setCategory] = useState("All");
  const [manufacturer, setManufacturer] = useState("All");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Reset country when region changes
  const handleRegionChange = (v: string) => {
    setRegion(v);
    setCountry("All");
    setPage(0);
  };

  const buildParams = useCallback(() => {
    const p: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) };
    if (region !== "All") p.region = region;
    if (country !== "All") p.country = country;
    if (category !== "All") p.category = category;
    if (manufacturer !== "All") p.manufacturer = manufacturer;
    if (search) p.search = search;
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    return new URLSearchParams(p).toString();
  }, [region, country, category, manufacturer, search, dateFrom, dateTo, page]);

  const { data: articles, isLoading: articlesLoading } = useQuery<ArticlesData>({
    queryKey: ["/api/articles", region, country, category, manufacturer, search, dateFrom, dateTo, page],
    queryFn: () => apiRequest("GET", `/api/articles?${buildParams()}`).then(r => r.json()),
    refetchInterval: 120000, // every 2 min
  });

  const { data: stats, isLoading: statsLoading } = useQuery<StatsData>({
    queryKey: ["/api/stats"],
    refetchInterval: 120000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/refresh").then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Refresh started", description: "Fetching latest news from all sources…" });
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["/api/articles"] });
        qc.invalidateQueries({ queryKey: ["/api/stats"] });
      }, 8000);
    },
  });

  const markSeenMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mark-seen").then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/articles"] });
      toast({ title: "All articles marked as seen" });
    },
  });

  const totalPages = Math.ceil((articles?.total || 0) / PAGE_SIZE);
  const countries = COUNTRIES_BY_REGION[region] || ["All"];

  // Day chart: fill gaps
  const dayChartData = (() => {
    if (!stats?.last30Days) return [];
    const map = new Map(stats.last30Days.map(d => [d.date, d.count]));
    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      result.push({ date: format(parseISO(d), "MMM d"), count: map.get(d) || 0 });
    }
    return result;
  })();

  return (
    <>
      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="shrink-0 bg-card border-b border-border px-6 py-3 flex items-center justify-between gap-4 z-10">
          <div>
            <h1 className="text-base font-bold text-foreground leading-none">Hearing Aid News</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Global Intelligence Dashboard · Hearing Aid Industry</p>
          </div>

          <div className="flex items-center gap-2">
            {(stats?.newCount || 0) > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8"
                onClick={() => markSeenMutation.mutate()}
                data-testid="button-mark-seen"
              >
                Mark {stats?.newCount} as seen
              </Button>
            )}
            <Button
              size="sm"
              className="text-xs h-8 gap-1.5"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              data-testid="button-refresh"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {refreshMutation.isPending ? "Refreshing…" : "Refresh Now"}
            </Button>
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle theme"
              data-testid="button-theme-toggle"
            >
              {theme === "dark"
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </button>
          </div>
        </header>

        {/* Scrollable main area */}
        <main className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {/* KPI Row */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            <StatCard label="Total Articles" value={stats?.total ?? "—"} sub="All time" />
            <StatCard label="New Articles" value={stats?.newCount ?? "—"} sub="Unread" accent />
            <StatCard label="Top Region" value={stats?.regionBreakdown?.[0]?.region ?? "—"} sub={`${stats?.regionBreakdown?.[0]?.count ?? "—"} articles`} />
            <StatCard label="Latest Source" value={stats?.topSources?.[0]?.source?.split(" ").slice(0, 2).join(" ") ?? "—"} sub="Most active" />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            {/* Activity line chart */}
            <div className="col-span-2 bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-semibold text-foreground mb-3">News Volume — Last 30 Days</div>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dayChartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={4} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Region pie */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-semibold text-foreground mb-3">By Region</div>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.regionBreakdown || []}
                      dataKey="count"
                      nameKey="region"
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={2}
                    >
                      {(stats?.regionBreakdown || []).map((entry, i) => (
                        <Cell key={entry.region} fill={REGION_COLORS[entry.region] || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-card border border-border rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">Filters</div>

              {/* Region */}
              <Select value={region} onValueChange={handleRegionChange}>
                <SelectTrigger className="h-8 text-xs w-40" data-testid="select-region">
                  <SelectValue placeholder="All Regions" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => <SelectItem key={r} value={r}>{r === "All" ? "All Regions" : r}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Country */}
              <Select value={country} onValueChange={v => { setCountry(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs w-36" data-testid="select-country">
                  <SelectValue placeholder="All Countries" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map(c => <SelectItem key={c} value={c}>{c === "All" ? "All Countries" : c}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Category */}
              <Select value={category} onValueChange={v => { setCategory(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs w-36" data-testid="select-category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c === "All" ? "All Categories" : CATEGORY_LABELS[c] || c}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Manufacturer */}
              <Select value={manufacturer} onValueChange={v => { setManufacturer(v); setPage(0); }}>
                <SelectTrigger className="h-8 text-xs w-44" data-testid="select-manufacturer">
                  <SelectValue placeholder="All Manufacturers" />
                </SelectTrigger>
                <SelectContent>
                  {MANUFACTURERS.map(m => (
                    <SelectItem key={m} value={m}>
                      {m === "All" ? "All Manufacturers" : m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date range */}
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(0); }}
                className="h-8 text-xs bg-background border border-input rounded-md px-2 text-foreground"
                data-testid="input-date-from"
                title="From date"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(0); }}
                className="h-8 text-xs bg-background border border-input rounded-md px-2 text-foreground"
                data-testid="input-date-to"
                title="To date"
              />

              {/* Search */}
              <div className="relative flex-1 min-w-40">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Search titles, sources, summaries…"
                  className="h-8 text-xs pl-7"
                  data-testid="input-search"
                />
              </div>

              {/* Clear */}
              {(region !== "All" || country !== "All" || category !== "All" || manufacturer !== "All" || search || dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { setRegion("All"); setCountry("All"); setCategory("All"); setManufacturer("All"); setSearch(""); setDateFrom(""); setDateTo(""); setPage(0); }}
                  data-testid="button-clear-filters"
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* Active filter chips */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {region !== "All" && <span className="text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 font-medium">📍 {region}</span>}
              {country !== "All" && <span className="text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 font-medium">{country}</span>}
              {category !== "All" && <span className="text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 font-medium">{CATEGORY_LABELS[category]}</span>}
              {manufacturer !== "All" && (
                <span
                  className="text-[11px] rounded-full px-2.5 py-0.5 font-semibold border"
                  style={{
                    backgroundColor: `${MANUFACTURER_COLORS[manufacturer]}22`,
                    color: MANUFACTURER_COLORS[manufacturer] || "hsl(var(--primary))",
                    borderColor: `${MANUFACTURER_COLORS[manufacturer]}55`,
                  }}
                >
                  🏭 {manufacturer}
                </span>
              )}
              {dateFrom && <span className="text-[11px] bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 font-medium">From {dateFrom}</span>}
              {dateTo && <span className="text-[11px] bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 font-medium">To {dateTo}</span>}
              {search && <span className="text-[11px] bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 font-medium">"{search}"</span>}
            </div>
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-muted-foreground">
              {articlesLoading ? "Loading…" : `${articles?.total ?? 0} article${articles?.total !== 1 ? "s" : ""}`}
              {articles?.total ? ` · Page ${page + 1} of ${totalPages}` : ""}
            </div>
          </div>

          {/* Articles grid */}
          {articlesLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : (articles?.articles?.length || 0) === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <svg className="mx-auto mb-3 opacity-30" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <p className="text-sm">No articles match your filters.</p>
              <p className="text-xs mt-1">Try clearing some filters or refreshing the feed.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(articles?.articles || []).map(article => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  onManufacturerClick={mfr => { setManufacturer(mfr); setPage(0); }}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6 pb-4">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                data-testid="button-prev-page"
              >
                ← Previous
              </Button>
              <span className="text-xs text-muted-foreground px-3">
                Page {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                data-testid="button-next-page"
              >
                Next →
              </Button>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
