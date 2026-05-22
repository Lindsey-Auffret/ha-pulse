import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useState, useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WeekRow {
  week: string;
  total: number;
  regulatory: number;
  clinical: number;
  financial: number;
  industry: number;
  reimbursement: number;
  general: number;
  sentimentScore: number;
}

interface WeeklyNews {
  weeks: WeekRow[];
  generatedAt: string;
}

interface OHLCVPoint { date: string; close: number; }
interface StockQuote {
  ticker: string; ciCompany: string; currency: string;
  price: number; changePercent: number; fxRate: number;
}
interface StocksData {
  quotes: StockQuote[];
  history: Record<string, OHLCVPoint[]>;
  lastUpdated: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TICKER_COLORS: Record<string, string> = {
  "SOON.SW":   "#1a6fc4",  // Sonova — blue (Phonak parent)
  "DEMANT.CO": "#7c3fa8",  // Demant — purple (Oticon/Widex parent)
  "GN.CO":     "#0f8090",  // GN Audio — teal (ReSound/Jabra parent)
};
const CATEGORY_COLORS: Record<string, string> = {
  regulatory: "#3b82f6", financial: "#22c55e",
  industry: "#f59e0b", clinical: "#a855f7",
  reimbursement: "#10b981", general: "#9ca3af",
};
const SENTIMENT_COLOR = "#f97316"; // orange

// ── Maths helpers ─────────────────────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY;
    num += dx * dy; denX += dx * dx; denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

// Weekly price-return from the history array (close-to-close %)
function weeklyReturns(history: OHLCVPoint[], weekStarts: string[]): (number | null)[] {
  // For each week start, find the close of that week from history
  // History is weekly (1wk interval from Yahoo), so find nearest date
  return weekStarts.map((ws, i) => {
    if (i === 0) return null;
    const prev = history.find(p => p.date <= weekStarts[i - 1])?.close
               ?? history.find(p => p.date >= weekStarts[i - 1])?.close ?? null;
    const curr = history.find(p => p.date <= ws)?.close
               ?? history.find(p => p.date >= ws)?.close ?? null;
    if (prev == null || curr == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  });
}

// Closest stock close to a given date
function closestClose(history: OHLCVPoint[], date: string): number | null {
  if (!history.length) return null;
  // find nearest by absolute date diff
  let best: OHLCVPoint | null = null;
  let bestDiff = Infinity;
  for (const p of history) {
    const diff = Math.abs(new Date(p.date).getTime() - new Date(date).getTime());
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return best ? best.close : null;
}

// Normalise array to 0-100 for overlay
function normalise(arr: (number | null)[]): (number | null)[] {
  const vals = arr.filter((v): v is number => v != null);
  if (!vals.length) return arr;
  const min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) return arr.map(v => v == null ? null : 50);
  return arr.map(v => v == null ? null : Math.round(((v - min) / (max - min)) * 100));
}

function fmt2(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(2);
}

function fmtDate(d: string) {
  try { return format(parseISO(d), "d MMM 'yy"); } catch { return d; }
}

function rLabel(r: number | null): { label: string; color: string } {
  if (r == null) return { label: "—", color: "text-muted-foreground" };
  const abs = Math.abs(r);
  const dir = r > 0 ? "↑ Positive" : "↓ Negative";
  if (abs >= 0.6)  return { label: `${dir} strong (r=${fmt2(r)})`,   color: r > 0 ? "text-emerald-600" : "text-red-500" };
  if (abs >= 0.35) return { label: `${dir} moderate (r=${fmt2(r)})`, color: r > 0 ? "text-emerald-500" : "text-red-400" };
  if (abs >= 0.15) return { label: `${dir} weak (r=${fmt2(r)})`,     color: "text-amber-500" };
  return { label: `No correlation (r=${fmt2(r)})`, color: "text-muted-foreground" };
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, overlayMode }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs min-w-[180px]">
      <div className="font-semibold text-muted-foreground mb-1.5">{fmtDate(label)}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 mb-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.fill || p.stroke || p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-semibold tabular-nums text-foreground">
            {typeof p.value === "number" ? (overlayMode ? p.value.toFixed(1) : p.value) : "—"}
            {overlayMode ? "" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Correlation row ───────────────────────────────────────────────────────────
function CorrRow({ ticker, company, r, lag }: { ticker: string; company: string; r: number | null; lag: number }) {
  const { label, color } = rLabel(r);
  const color2 = TICKER_COLORS[ticker] || "#888";
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-2 w-48 shrink-0">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: color2 }} />
        <div>
          <div className="text-xs font-bold text-foreground">{company}</div>
          <div className="text-[10px] font-mono text-muted-foreground">{ticker}</div>
        </div>
      </div>
      {/* r bar */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-secondary rounded-full relative overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
            {r != null && (
              <div
                className={`absolute inset-y-0 rounded-full ${r > 0 ? "bg-emerald-500" : "bg-red-400"}`}
                style={{
                  left: r > 0 ? "50%" : `${50 + r * 50}%`,
                  width: `${Math.abs(r) * 50}%`,
                }}
              />
            )}
          </div>
          <span className={`text-xs font-bold tabular-nums w-14 text-right ${color}`}>
            {r != null ? fmt2(r) : "—"}
          </span>
        </div>
        <div className={`text-[10px] mt-0.5 ${color}`}>{label}</div>
      </div>
      <div className="text-[10px] text-muted-foreground w-20 text-right shrink-0">
        {lag === 0 ? "Same week" : `${lag}w lag`}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Correlation() {
  const [selectedTicker, setSelectedTicker] = useState<string>("SOON.SW");
  const [lagWeeks, setLagWeeks] = useState<number>(0);
  const [stackBars, setStackBars] = useState<boolean>(false);
  const [overlayMode, setOverlayMode] = useState<"sentiment" | "indexed">("sentiment");

  const { data: newsData, isLoading: newsLoading } = useQuery<WeeklyNews>({
    queryKey: ["weekly-news"],
    queryFn: async () => {
      try { const r = await fetch('/api/weekly-news'); if (r.ok) return r.json(); } catch {}
      return fetch(`./weekly_news.json?t=${Date.now()}`).then(r => r.json());
    },
    staleTime: 60 * 60 * 1000,
  });

  const { data: stocksData, isLoading: stocksLoading } = useQuery<StocksData>({
    queryKey: ["stocks-static"],
    queryFn: async () => {
      try { const r = await fetch('/api/stocks'); if (r.ok) return r.json(); } catch {}
      return fetch(`./stocks.json?t=${Date.now()}`).then(r => r.json());
    },
    staleTime: 60 * 60 * 1000,
  });

  const isLoading = newsLoading || stocksLoading;

  // ── Build merged chart dataset ───────────────────────────────────────────
  const { chartData, correlations } = useMemo(() => {
    if (!newsData || !stocksData) return { chartData: [], correlations: [] };

    const weeks = newsData.weeks;
    const history = stocksData.history;
    const tickers = ["SOON.SW", "DEMANT.CO", "GN.CO"];

    // For each week, get the closest stock close (indexed to 100 at start)
    const stockSeries: Record<string, (number | null)[]> = {};
    tickers.forEach(t => {
      const h = history[t] ?? [];
      const closes = weeks.map(w => closestClose(h, w.week));
      // index to first non-null
      const firstVal = closes.find(v => v != null) ?? 1;
      stockSeries[t] = closes.map(v => v == null ? null : Math.round((v / firstVal) * 10000) / 100);
    });

    // Sentiment normalised 0-100 already
    const sentiment = weeks.map(w => w.sentimentScore);

    // Build chart rows
    const chartData = weeks.map((w, i) => ({
      date: w.week,
      total: w.total,
      regulatory: w.regulatory,
      clinical: w.clinical,
      financial: w.financial,
      industry: w.industry,
      reimbursement: w.reimbursement,
      general: w.general,
      sentiment: w.sentimentScore,
      // Stock overlays (indexed)
      "SOON.SW":   stockSeries["SOON.SW"][i],
      "DEMANT.CO": stockSeries["DEMANT.CO"][i],
      "GN.CO":     stockSeries["GN.CO"][i],
    }));

    // ── Pearson correlation: sentiment vs stock weekly return ──────────────
    const correlations = tickers.map(ticker => {
      const h = history[ticker] ?? [];

      // For each week, get the indexed price
      const stockIndexed = weeks.map(w => closestClose(h, w.week));
      const firstVal = stockIndexed.find(v => v != null) ?? 1;
      const normalizedStock = stockIndexed.map(v => v == null ? null : (v / firstVal) * 100);

      // Apply lag: shift sentiment by lagWeeks (positive = news leads stock)
      // We compare sentiment[i] with stock[i + lag]
      const sentimentArr: number[] = [];
      const stockArr: number[] = [];

      for (let i = 0; i < weeks.length - lagWeeks; i++) {
        const s = sentiment[i];
        const p = normalizedStock[i + lagWeeks];
        if (s != null && p != null) {
          sentimentArr.push(s);
          stockArr.push(p);
        }
      }

      // Also compute week-on-week change in stock (return-based correlation)
      const returnSentiment: number[] = [];
      const returns: number[] = [];
      for (let i = 1; i < weeks.length - lagWeeks; i++) {
        const s = sentiment[i];
        const p0 = normalizedStock[i - 1 + lagWeeks];
        const p1 = normalizedStock[i + lagWeeks];
        if (s != null && p0 != null && p1 != null && p0 !== 0) {
          returnSentiment.push(s);
          returns.push(((p1 - p0) / p0) * 100);
        }
      }

      return {
        ticker,
        company: stocksData.quotes.find(q => q.ticker === ticker)?.ciCompany ?? ticker,
        rLevel: pearson(sentimentArr, stockArr),
        rReturn: pearson(returnSentiment, returns),
      };
    });

    return { chartData, correlations };
  }, [newsData, stocksData, lagWeeks]);

  const selectedStock = stocksData?.quotes.find(q => q.ticker === selectedTicker);
  const categories = ["regulatory", "financial", "industry", "reimbursement", "clinical", "general"] as const;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-foreground leading-none">News–Price Correlation</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Do HA news spikes align with stock price moves? Weekly sentiment score vs. indexed price over 52 weeks.
            </p>
          </div>
          {/* Lag selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground">News leads stock by:</span>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              {[0, 1, 2, 4].map(l => (
                <button key={l}
                  className={`text-[10px] px-2.5 py-1 rounded-md font-semibold transition-colors ${lagWeeks === l ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
                  onClick={() => setLagWeeks(l)}
                >
                  {l === 0 ? "Same" : `${l}w`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">

        {/* ── Correlation Summary Cards ─────────────────────────────────────── */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
            Pearson r — News Sentiment Score vs. Stock (Indexed Price Level)
            {lagWeeks > 0 && <span className="ml-2 text-amber-500">· {lagWeeks}-week lag applied</span>}
          </div>
          {isLoading ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border px-4">
              {correlations.map(c => (
                <CorrRow key={c.ticker} ticker={c.ticker} company={c.company} r={c.rLevel} lag={lagWeeks} />
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/60 mt-2">
            r &gt; 0.6 = strong positive · 0.35–0.6 = moderate · 0.15–0.35 = weak · &lt;0.15 = none.
            Pearson r measures linear co-movement of weekly news sentiment score vs. USD-indexed stock price.
          </p>
        </div>

        {/* ── Main Chart: bars + overlay ────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Weekly News Volume &amp; Sentiment · Overlay: Stock Price
            </div>
            <div className="flex items-center gap-2">
              {/* Bar mode toggle */}
              <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                <button
                  className={`text-[10px] px-2 py-1 rounded-md font-semibold transition-colors ${!stackBars ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
                  onClick={() => setStackBars(false)}
                >By category</button>
                <button
                  className={`text-[10px] px-2 py-1 rounded-md font-semibold transition-colors ${stackBars ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
                  onClick={() => setStackBars(true)}
                >Stacked</button>
              </div>
              {/* Stock ticker selector */}
              <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                {(["SOON.SW", "DEMANT.CO", "GN.CO"] as const).map(t => (
                  <button key={t}
                    className={`text-[10px] px-2 py-1 rounded-md font-semibold transition-colors ${selectedTicker === t ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
                    onClick={() => setSelectedTicker(t)}
                  >
                    {t === "SOON.SW" ? "SOON" : t === "DEMANT.CO" ? "DEMANT" : "GN"}
                  </button>
                ))}
                <button
                  className={`text-[10px] px-2 py-1 rounded-md font-semibold transition-colors ${selectedTicker === "ALL" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
                  onClick={() => setSelectedTicker("ALL")}
                >All</button>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mb-4">
            Bars = article count by category · Orange line = weighted sentiment score (0–100) · Coloured lines = indexed stock price (base=100)
          </p>

          {isLoading ? <Skeleton className="h-64 w-full rounded-lg" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={fmtDate}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={6} />

                {/* Left Y: article count */}
                <YAxis yAxisId="articles" orientation="left"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={30}
                  label={{ value: "Articles", angle: -90, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))", dy: 30 }} />

                {/* Right Y: sentiment / stock indexed */}
                <YAxis yAxisId="index" orientation="right"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={40}
                  domain={[0, 'auto']}
                  label={{ value: "Index / Score", angle: 90, position: "insideRight", fontSize: 9, fill: "hsl(var(--muted-foreground))", dy: -40 }} />

                <Tooltip content={<ChartTooltip overlayMode={false} />} />

                {/* Category bars */}
                {stackBars ? (
                  categories.map((cat, i) => (
                    <Bar key={cat} yAxisId="articles" dataKey={cat} name={cat.charAt(0).toUpperCase() + cat.slice(1)}
                      stackId="cats" fill={CATEGORY_COLORS[cat]} maxBarSize={18} opacity={0.85} />
                  ))
                ) : (
                  <Bar yAxisId="articles" dataKey="total" name="Total Articles"
                    fill="hsl(var(--muted-foreground))" opacity={0.25} maxBarSize={18} />
                )}

                {/* Sentiment score overlay (orange) */}
                <Line yAxisId="index" type="monotone" dataKey="sentiment" name="Sentiment Score"
                  stroke={SENTIMENT_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 3 }} connectNulls />

                {/* Stock price overlay(s) */}
                {(selectedTicker === "ALL" ? ["SOON.SW", "DEMANT.CO", "GN.CO"] : [selectedTicker]).map(t => (
                  <Line key={t} yAxisId="index" type="monotone" dataKey={t}
                    name={stocksData?.quotes.find(q => q.ticker === t)?.ciCompany ?? t}
                    stroke={TICKER_COLORS[t]} strokeWidth={1.5} dot={false}
                    activeDot={{ r: 3 }} connectNulls strokeDasharray="5 3" />
                ))}

                <ReferenceLine yAxisId="index" y={100} stroke="hsl(var(--border))" strokeDasharray="3 2" />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          {!isLoading && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 rounded" style={{ background: SENTIMENT_COLOR }} />
                <span className="text-[10px] text-muted-foreground">Sentiment score</span>
              </div>
              {(selectedTicker === "ALL" ? ["SOON.SW", "DEMANT.CO", "GN.CO"] : [selectedTicker]).map(t => (
                <div key={t} className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded" style={{ background: TICKER_COLORS[t], borderTop: `2px dashed ${TICKER_COLORS[t]}` }} />
                  <span className="text-[10px] text-muted-foreground">
                    {stocksData?.quotes.find(q => q.ticker === t)?.ciCompany} (indexed)
                  </span>
                </div>
              ))}
              {stackBars ? categories.map(cat => (
                <div key={cat} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: CATEGORY_COLORS[cat] }} />
                  <span className="text-[10px] text-muted-foreground capitalize">{cat}</span>
                </div>
              )) : (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-muted-foreground/25" />
                  <span className="text-[10px] text-muted-foreground">Total articles</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Category breakdown heatmap ─────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
            News Category Spike Analysis — Last 16 Weeks
          </div>
          {isLoading ? <Skeleton className="h-36 w-full" /> : (() => {
            const recent = (newsData?.weeks ?? []).slice(-16);
            const maxByCategory: Record<string, number> = {};
            categories.forEach(cat => {
              maxByCategory[cat] = Math.max(...recent.map(w => (w as any)[cat] as number), 1);
            });
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr>
                      <td className="pr-3 pb-1 text-muted-foreground w-20">Week</td>
                      {categories.map(cat => (
                        <td key={cat} className="pb-1 text-center text-muted-foreground capitalize px-1 min-w-[52px]">{cat}</td>
                      ))}
                      <td className="pb-1 text-center text-muted-foreground px-1 font-semibold">Score</td>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(w => (
                      <tr key={w.week} className="border-t border-border/50">
                        <td className="pr-3 py-1 text-muted-foreground tabular-nums">{fmtDate(w.week)}</td>
                        {categories.map(cat => {
                          const val = (w as any)[cat] as number;
                          const intensity = val / maxByCategory[cat];
                          return (
                            <td key={cat} className="text-center py-1 px-1">
                              {val > 0 ? (
                                <span
                                  className="inline-flex items-center justify-center w-7 h-5 rounded text-[9px] font-bold"
                                  style={{
                                    background: CATEGORY_COLORS[cat] + Math.round(intensity * 200).toString(16).padStart(2, "0"),
                                    color: intensity > 0.5 ? "white" : CATEGORY_COLORS[cat],
                                  }}
                                >
                                  {val}
                                </span>
                              ) : (
                                <span className="text-border">·</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-center py-1 px-1">
                          <span className="inline-flex items-center justify-center w-8 h-5 rounded text-[9px] font-bold tabular-nums"
                            style={{
                              background: SENTIMENT_COLOR + Math.round((w.sentimentScore / 100) * 220).toString(16).padStart(2, "0"),
                              color: w.sentimentScore > 50 ? "white" : SENTIMENT_COLOR,
                            }}
                          >
                            {w.sentimentScore}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        {/* ── Methodology note ──────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-4 text-[10px] text-muted-foreground space-y-1">
          <div className="font-semibold text-foreground mb-1">Methodology</div>
          <div><span className="font-medium">Sentiment score</span> — weighted article count per week: Regulatory ×3, Financial ×2.5, Reimbursement ×2, Industry ×2, Clinical ×1.5, General ×0.5. Normalised 0–100 across the trailing 52 weeks.</div>
          <div><span className="font-medium">Stock series</span> — weekly closing prices in USD (SOON.SW CHF and DEMANT.CO/GN.CO DKK FX-converted), indexed to 100 at the start of the period.</div>
          <div><span className="font-medium">Pearson r</span> — linear correlation between the sentiment score and indexed stock price level across all weeks with overlapping data. Use the lag selector to test whether news leads price moves by 1–4 weeks.</div>
          <div><span className="font-medium">Limitation</span> — the hearing aid news database is newly seeded. A larger corpus would yield more robust correlation estimates.</div>
        </div>
      </div>
    </div>
  );
}
