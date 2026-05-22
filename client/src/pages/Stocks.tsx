import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────
interface StockQuote {
  ticker: string;
  name: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number | null;
  pe: number | null;
  yearLow: number;
  yearHigh: number;
  previousClose: number;
  exchange: string;
  ciCompany: string;
  role: string;
  fetchedAt: string;
  fxToUsd: number;
}

interface OHLCVPoint {
  date: string;
  close: number;
}

interface FxRates {
  CHFUSD: number;
  DKKUSD: number;
  EURUSD: number;
  fetchedAt: string;
}

interface StocksData {
  quotes: StockQuote[];
  history: Record<string, OHLCVPoint[]>;
  fxRates?: FxRates;
  lastUpdated: string;
}

type DisplayCurrency = "native" | "USD" | "EUR" | "CHF";

// ── Constants ─────────────────────────────────────────────────────────────────
const TICKER_COLORS: Record<string, string> = {
  "COH.AX":    "#d4a017",  // Cochlear Ltd — yellow
  "SONVF":     "#1a6fc4",  // Sonova / Advanced Bionics — blue
  "DEMANT.CO": "#7c3fa8",  // Demant / Oticon Medical — purple
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  native: "",
  USD: "$",
  EUR: "€",
  CHF: "CHF ",
};

const CURRENCY_LABELS: Record<DisplayCurrency, string> = {
  native: "Native",
  USD: "USD",
  EUR: "EUR",
  CHF: "CHF",
};

// ── FX Conversion ─────────────────────────────────────────────────────────────
// Each quote has fxToUsd = (1 unit native → USD)
// To display in target currency:
//   price_target = price_native * fxToUsd / fxToUsd_target
// where fxToUsd_target for USD=1, EUR=1/EURUSD, AUD=1/AUDUSD

function getFxToUsd(currency: string, fxRates: FxRates): number {
  if (currency === "USD") return 1.0;
  if (currency === "CHF") return fxRates.CHFUSD;
  if (currency === "DKK") return fxRates.DKKUSD;
  if (currency === "EUR") return fxRates.EURUSD;
  return 1.0;
}

function getTargetFxToUsd(target: DisplayCurrency, fxRates: FxRates): number {
  if (target === "native") return 1.0; // unused in native mode
  if (target === "USD") return 1.0;
  if (target === "EUR") return fxRates.EURUSD;
  if (target === "CHF") return fxRates.CHFUSD;
  return 1.0;
}

function convertPrice(
  native: number,
  quote: StockQuote,
  target: DisplayCurrency,
  fxRates: FxRates
): number {
  if (target === "native") return native;
  const toUsd = quote.fxToUsd ?? getFxToUsd(quote.currency, fxRates);
  const targetRate = getTargetFxToUsd(target, fxRates);
  return (native * toUsd) / targetRate;
}

function displayCurrency(quote: StockQuote, target: DisplayCurrency): string {
  if (target === "native") return quote.currency;
  return target;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMarketCap(n: number | null, currency: string): string {
  if (n == null) return "—";
  if (n >= 1e12) return `${currency} ${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${currency} ${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `${currency} ${(n / 1e6).toFixed(0)}M`;
  return `${currency} ${n.toFixed(0)}`;
}

function fmtDate(d: string) {
  try { return format(parseISO(d), "d MMM 'yy"); } catch { return d; }
}

function fmtTime(d: string) {
  try { return format(parseISO(d), "dd MMM yyyy, HH:mm"); } catch { return d; }
}

function changeColor(v: number): string {
  if (v > 0) return "text-emerald-600 dark:text-emerald-400";
  if (v < 0) return "text-red-500 dark:text-red-400";
  return "text-muted-foreground";
}

function changeBg(v: number): string {
  if (v > 0) return "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800";
  if (v < 0) return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
  return "bg-secondary border-border";
}

function Arrow({ v }: { v: number }) {
  if (v > 0) return <span className="text-emerald-500">▲</span>;
  if (v < 0) return <span className="text-red-400">▼</span>;
  return null;
}

// Compute indexed performance (base = 100)
function indexHistory(history: OHLCVPoint[]): { date: string; indexed: number }[] {
  if (!history.length) return [];
  const base = history[0].close;
  if (!base) return [];
  return history.map(p => ({ date: p.date, indexed: Math.round((p.close / base) * 10000) / 100 }));
}

// 52-week range bar
function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const pct = high > low ? Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100)) : 50;
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] tabular-nums text-muted-foreground w-12 text-right shrink-0">{fmt(low, 0)}</span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full relative">
        <div className="absolute inset-y-0 left-0 bg-primary/30 rounded-full" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-12 text-left shrink-0">{fmt(high, 0)}</span>
    </div>
  );
}

// ── Custom Chart Tooltip ───────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-muted-foreground mb-1">{fmtDate(label)}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke }} />
          <span className="text-foreground font-semibold tabular-nums">
            {currency && !p.name?.includes("indexed") ? `${currency} ` : ""}
            {typeof p.value === "number" ? fmt(p.value) : p.value}
            {p.name?.includes("indexed") ? "%" : ""}
          </span>
          {p.name && <span className="text-muted-foreground">{p.name}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Currency Toggle ────────────────────────────────────────────────────────────
function CurrencyToggle({
  value,
  onChange,
}: {
  value: DisplayCurrency;
  onChange: (c: DisplayCurrency) => void;
}) {
  const options: DisplayCurrency[] = ["native", "USD", "EUR", "CHF"];
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground font-medium mr-0.5">Display in</span>
      <div className="flex items-center bg-secondary rounded-lg p-0.5 gap-0.5">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`text-[10px] px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
              value === opt
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt === "native" ? "Native" : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── FX Rate Bar ────────────────────────────────────────────────────────────────
function FxRateBar({ fxRates, displayCur }: { fxRates: FxRates; displayCur: DisplayCurrency }) {
  if (displayCur === "native") return null;

  const rates: { label: string; value: string }[] = [];
  if (displayCur === "USD" || displayCur === "EUR" || displayCur === "CHF") {
    rates.push({ label: "CHF/USD", value: fxRates.CHFUSD.toFixed(4) });
    rates.push({ label: "DKK/USD", value: fxRates.DKKUSD.toFixed(4) });
    rates.push({ label: "EUR/USD", value: fxRates.EURUSD.toFixed(4) });
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-secondary/50 rounded-lg text-[10px] text-muted-foreground">
      <span className="font-semibold text-foreground/60">FX</span>
      {rates.map(r => (
        <span key={r.label} className="tabular-nums">
          <span className="font-medium text-foreground/70">{r.label}</span>{" "}
          {r.value}
        </span>
      ))}
      <span className="ml-auto opacity-60">as of {fmtTime(fxRates.fetchedAt)}</span>
    </div>
  );
}

// ── Stock Card ────────────────────────────────────────────────────────────────
function StockCard({
  quote,
  history,
  onSelect,
  selected,
  displayCur,
  fxRates,
}: {
  quote: StockQuote;
  history: OHLCVPoint[];
  onSelect: () => void;
  selected: boolean;
  displayCur: DisplayCurrency;
  fxRates: FxRates;
}) {
  const color = TICKER_COLORS[quote.ticker] || "#888";
  const isUp = quote.changePercent >= 0;
  const mini = history.slice(-12);

  const cur = displayCurrency(quote, displayCur);
  const conv = (v: number) => convertPrice(v, quote, displayCur, fxRates);

  const displayPrice = conv(quote.price);
  const displayChange = conv(quote.change);
  const displayYearLow = conv(quote.yearLow);
  const displayYearHigh = conv(quote.yearHigh);
  const displayPrevClose = conv(quote.previousClose);
  const displayMarketCap = quote.marketCap ? conv(quote.marketCap) : null;

  // Mini sparkline — keep native values for shape, label shows converted
  const miniConverted = mini.map(p => ({ ...p, close: conv(p.close) }));

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
        selected
          ? "border-primary/60 shadow-md bg-card ring-1 ring-primary/20"
          : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[11px] font-mono text-muted-foreground">{quote.ticker}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${changeBg(quote.changePercent)}`}>
              {quote.role}
            </span>
          </div>
          <div className="text-sm font-bold text-foreground mt-0.5 leading-tight">{quote.ciCompany}</div>
          <div className="text-[10px] text-muted-foreground">{quote.name} · {quote.exchange}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-bold tabular-nums text-foreground">
            {fmt(displayPrice)}{" "}
            <span className="text-xs text-muted-foreground font-normal">{cur}</span>
          </div>
          <div className={`text-xs font-semibold tabular-nums flex items-center justify-end gap-1 ${changeColor(quote.changePercent)}`}>
            <Arrow v={quote.changePercent} />
            {displayChange > 0 ? "+" : ""}{fmt(displayChange)} ({quote.changePercent > 0 ? "+" : ""}{fmt(quote.changePercent)}%)
          </div>
          {displayCur !== "native" && (
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">
              {fmt(quote.price)} {quote.currency} native
            </div>
          )}
        </div>
      </div>

      {/* Mini sparkline */}
      {miniConverted.length > 0 && (
        <div className="h-12 -mx-1 mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={miniConverted} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
              <defs>
                <linearGradient id={`grad-${quote.ticker.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="close"
                stroke={isUp ? "#10b981" : "#ef4444"}
                strokeWidth={1.5}
                fill={`url(#grad-${quote.ticker.replace(/[^a-z0-9]/gi, "")})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 52-week range */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>52-week range</span>
          <span className="tabular-nums">{cur} {fmt(displayYearLow, 0)} – {fmt(displayYearHigh, 0)}</span>
        </div>
        <RangeBar low={displayYearLow} high={displayYearHigh} current={displayPrice} />
      </div>

      {/* Market cap + P/E */}
      <div className="flex gap-3 mt-2 pt-2 border-t border-border">
        <div>
          <div className="text-[10px] text-muted-foreground">Market Cap</div>
          <div className="text-xs font-semibold tabular-nums text-foreground">{fmtMarketCap(displayMarketCap, cur)}</div>
        </div>
        {quote.pe && (
          <div>
            <div className="text-[10px] text-muted-foreground">P/E Ratio</div>
            <div className="text-xs font-semibold tabular-nums text-foreground">{fmt(quote.pe, 1)}x</div>
          </div>
        )}
        <div className="ml-auto">
          <div className="text-[10px] text-muted-foreground">Prev. Close</div>
          <div className="text-xs font-semibold tabular-nums text-foreground">{fmt(displayPrevClose)}</div>
        </div>
      </div>
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Stocks() {
  const qc = useQueryClient();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [showIndexed, setShowIndexed] = useState(false);
  const [displayCur, setDisplayCur] = useState<DisplayCurrency>("native");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError } = useQuery<StocksData>({
    queryKey: ["/api/stocks"],
    queryFn: async ({ queryKey }) => {
      const force = (queryKey as string[])[1] === "force";
      // Try the live API first (works on Render where backend is running)
      // Fall back to static stocks.json (works on Perplexity static hosting)
      try {
        const r = await fetch(`/api/stocks${force ? "?force=1" : ""}`);
        if (r.ok) return r.json();
      } catch {}
      const r2 = await fetch(`./stocks.json?t=${Date.now()}`);
      if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
      return r2.json();
    },
    refetchInterval: 15 * 60 * 1000,
    staleTime: 14 * 60 * 1000,
    retry: 2,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Use a "force" key variant so queryFn receives the flag and hits ?force=1
    await qc.fetchQuery({
      queryKey: ["/api/stocks", "force"],
      queryFn: async () => {
        try {
          const r = await fetch("/api/stocks?force=1");
          if (r.ok) return r.json();
        } catch {}
        const r2 = await fetch(`./stocks.json?t=${Date.now()}`);
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
        return r2.json();
      },
      staleTime: 0,
    }).then((fresh) => {
      // Populate the main query key with the fresh data
      qc.setQueryData(["/api/stocks"], fresh);
    }).catch(() => {});
    setIsRefreshing(false);
  };

  const quotes = data?.quotes ?? [];
  const history = data?.history ?? {};

  // Fallback FX rates if missing from JSON
  const fxRates: FxRates = data?.fxRates ?? {
    CHFUSD: 1.12,
    DKKUSD: 0.145,
    EURUSD: 1.08,
    fetchedAt: new Date().toISOString(),
  };

  // Convert a history array for a given quote to the display currency
  function convertHistory(ticker: string, hist: OHLCVPoint[]): OHLCVPoint[] {
    if (displayCur === "native") return hist;
    const quote = quotes.find(q => q.ticker === ticker);
    if (!quote) return hist;
    return hist.map(p => ({ date: p.date, close: parseFloat(convertPrice(p.close, quote, displayCur, fxRates).toFixed(2)) }));
  }

  // Build combined chart data for all tickers
  const combinedChartData = (() => {
    if (!data) return [];
    const allDates = new Set<string>();
    for (const h of Object.values(history)) {
      h.forEach(p => allDates.add(p.date));
    }
    const sorted = Array.from(allDates).sort();
    return sorted.map(date => {
      const row: Record<string, any> = { date };
      for (const [ticker, h] of Object.entries(history)) {
        const convH = convertHistory(ticker, h);
        const point = convH.find(p => p.date === date);
        if (showIndexed) {
          const indexed = indexHistory(convH);
          const ip = indexed.find(p => p.date === date);
          row[ticker] = ip?.indexed ?? null;
        } else {
          row[ticker] = point?.close ?? null;
        }
      }
      return row;
    });
  })();

  // Single ticker chart data
  const selectedQuote = quotes.find(q => q.ticker === selectedTicker);
  const selectedHistoryRaw = selectedTicker ? (history[selectedTicker] ?? []) : [];
  const selectedHistory = selectedTicker ? convertHistory(selectedTicker, selectedHistoryRaw) : [];
  const startPrice = selectedHistory[0]?.close ?? 0;

  const chartCurrencyLabel = displayCur === "native" ? "—" : displayCur;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-foreground leading-none">CI Market Tracker</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live share prices for publicly traded cochlear implant companies — updated every 15 min
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CurrencyToggle value={displayCur} onChange={setDisplayCur} />
            {data?.lastUpdated && (
              <span className="text-[10px] text-muted-foreground">
                Updated {fmtTime(data.lastUpdated)}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8 gap-1.5"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <svg
                width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className={isRefreshing ? "animate-spin" : ""}
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-4">

        {/* FX rate bar — shown when not in native mode */}
        {data?.fxRates && <FxRateBar fxRates={fxRates} displayCur={displayCur} />}

        {isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-6 text-center text-sm text-red-600 dark:text-red-400">
            Could not load stock data. Markets may be closed or the data source is temporarily unavailable.
          </div>
        )}

        {/* ── Stock Cards ─────────────────────────────────────────────────── */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Live Quotes</div>
          {isLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {quotes.map(q => (
                <StockCard
                  key={q.ticker}
                  quote={q}
                  history={history[q.ticker] ?? []}
                  selected={selectedTicker === q.ticker}
                  onSelect={() => setSelectedTicker(prev => prev === q.ticker ? null : q.ticker)}
                  displayCur={displayCur}
                  fxRates={fxRates}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Combined Performance Chart ──────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              1-Year Performance — All Companies
            </div>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              <button
                className={`text-[10px] px-2.5 py-1 rounded-md font-semibold transition-colors ${!showIndexed ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
                onClick={() => setShowIndexed(false)}
              >
                Absolute
              </button>
              <button
                className={`text-[10px] px-2.5 py-1 rounded-md font-semibold transition-colors ${showIndexed ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
                onClick={() => setShowIndexed(true)}
              >
                Indexed (base=100)
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mb-4">
            {showIndexed
              ? "All prices rebased to 100 at start of period — shows relative % performance"
              : displayCur === "native"
                ? "Absolute closing prices in each company's native currency (CHF / DKK)"
                : `Absolute closing prices converted to ${displayCur} at current FX rates`}
          </p>

          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={combinedChartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval={7}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  width={50}
                />
                <Tooltip content={<ChartTooltip currency={showIndexed ? undefined : (displayCur === "native" ? "—" : displayCur)} />} />
                {showIndexed && <ReferenceLine y={100} stroke="hsl(var(--border))" strokeDasharray="4 2" />}
                {quotes.map(q => (
                  <Line
                    key={q.ticker}
                    type="monotone"
                    dataKey={q.ticker}
                    name={q.ciCompany}
                    stroke={TICKER_COLORS[q.ticker] || "#888"}
                    strokeWidth={selectedTicker && selectedTicker !== q.ticker ? 1 : 2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                    opacity={selectedTicker && selectedTicker !== q.ticker ? 0.3 : 1}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          {!isLoading && (
            <div className="flex gap-4 mt-3 flex-wrap">
              {quotes.map(q => (
                <button
                  key={q.ticker}
                  className={`flex items-center gap-1.5 transition-opacity ${selectedTicker && selectedTicker !== q.ticker ? "opacity-30" : ""}`}
                  onClick={() => setSelectedTicker(prev => prev === q.ticker ? null : q.ticker)}
                >
                  <div className="w-3 h-0.5" style={{ background: TICKER_COLORS[q.ticker] }} />
                  <span className="text-[11px] font-medium text-foreground">{q.ciCompany}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{q.ticker}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Detailed Chart for selected ticker ──────────────────────────── */}
        {selectedTicker && selectedQuote && selectedHistory.length > 0 && (() => {
          const cur = displayCurrency(selectedQuote, displayCur);
          const conv = (v: number) => convertPrice(v, selectedQuote, displayCur, fxRates);
          const displayPrice = conv(selectedQuote.price);
          const displayYearHigh = conv(selectedQuote.yearHigh);
          const displayMarketCap = selectedQuote.marketCap ? conv(selectedQuote.marketCap) : null;
          const ret = startPrice > 0 ? ((displayPrice - startPrice) / startPrice) * 100 : null;

          return (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: TICKER_COLORS[selectedTicker] }} />
                    <span className="text-sm font-bold text-foreground">{selectedQuote.ciCompany}</span>
                    <span className="text-xs font-mono text-muted-foreground">{selectedTicker}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {selectedQuote.name} · {selectedQuote.exchange}
                    {displayCur !== "native"
                      ? ` · displayed in ${cur} (native: ${selectedQuote.currency})`
                      : ` · ${selectedQuote.currency}`}
                  </div>
                </div>
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setSelectedTicker(null)}
                >
                  ✕ Close
                </button>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-5">
                <div className="bg-secondary/40 rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground">Current Price</div>
                  <div className="text-lg font-bold tabular-nums" style={{ color: TICKER_COLORS[selectedTicker] }}>
                    {fmt(displayPrice)} {cur}
                  </div>
                  <div className={`text-[11px] font-semibold ${changeColor(selectedQuote.changePercent)}`}>
                    <Arrow v={selectedQuote.changePercent} /> {selectedQuote.changePercent > 0 ? "+" : ""}{fmt(selectedQuote.changePercent)}% today
                  </div>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground">1-Year Return</div>
                  <div className={`text-lg font-bold tabular-nums ${ret != null ? changeColor(ret) : "text-foreground"}`}>
                    {ret != null ? `${ret > 0 ? "+" : ""}${fmt(ret)}%` : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">vs. 1 year ago</div>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground">52W High</div>
                  <div className="text-lg font-bold tabular-nums text-foreground">{fmt(displayYearHigh)}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {displayYearHigh > 0 ? `${fmt(((displayPrice - displayYearHigh) / displayYearHigh) * 100)}% from high` : "—"}
                  </div>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground">Market Cap</div>
                  <div className="text-lg font-bold tabular-nums text-foreground">{fmtMarketCap(displayMarketCap, cur)}</div>
                  <div className="text-[10px] text-muted-foreground">{selectedQuote.exchange}</div>
                </div>
              </div>

              {/* Full 1-year area chart */}
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={selectedHistory} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id={`area-${selectedTicker.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="10%" stopColor={TICKER_COLORS[selectedTicker]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={TICKER_COLORS[selectedTicker]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval={6}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    domain={["auto", "auto"]}
                    width={55}
                    tickFormatter={v => fmt(v, 0)}
                  />
                  <Tooltip content={<ChartTooltip currency={cur} />} />
                  {startPrice > 0 && (
                    <ReferenceLine
                      y={startPrice}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="4 2"
                      label={{ value: "1Y Ago", fontSize: 9, fill: "hsl(var(--muted-foreground))", position: "insideTopLeft" }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke={TICKER_COLORS[selectedTicker]}
                    strokeWidth={2}
                    fill={`url(#area-${selectedTicker.replace(/[^a-z0-9]/gi, "")})`}
                    dot={false}
                    activeDot={{ r: 4, fill: TICKER_COLORS[selectedTicker] }}
                  />
                </AreaChart>
              </ResponsiveContainer>

              {/* 52-week range */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide font-semibold">52-Week Range ({cur})</div>
                <RangeBar low={conv(selectedQuote.yearLow)} high={displayYearHigh} current={displayPrice} />
              </div>
            </div>
          );
        })()}

        {/* ── Disclaimer ──────────────────────────────────────────────────── */}
        <div className="text-[10px] text-muted-foreground/60 text-center pb-2">
          Stock data sourced from Yahoo Finance via public API. Prices may be delayed 15–20 minutes. Not investment advice.
          Phonak/Signia (Sonova), Oticon/Widex (Demant), and ReSound/Jabra (GN Audio) are publicly traded.
          Starkey, Eargo, and WS Audiology are private companies. Native currencies: SOON.SW in CHF · DEMANT.CO in DKK · GN.CO in DKK.
        </div>
      </div>
    </div>
  );
}
