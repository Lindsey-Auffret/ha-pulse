/**
 * stockFetcher.ts — fetches live quotes + 1-year weekly OHLCV for HA public companies
 * Uses Yahoo Finance v8 API (no API key required).
 * Prices are served in each stock's native currency.
 * Results are cached for 15 minutes to avoid hammering the API.
 */

export interface StockQuote {
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
}

export interface OHLCVPoint {
  date: string;   // YYYY-MM-DD
  close: number;  // native currency
}

export interface FxRates {
  CHFUSD: number;
  DKKUSD: number;
  EURUSD: number;
  fetchedAt: string;
}

export interface StockData {
  quotes: StockQuote[];
  history: Record<string, OHLCVPoint[]>;
  fxRates?: FxRates;
  lastUpdated: string;
}

// ── HA Companies with public tickers ────────────────────────────────────────
const CI_STOCKS = [
  { ticker: "SOON.SW",   name: "Sonova Holding AG",  currency: "CHF", exchange: "SIX Swiss Exchange", ciCompany: "Sonova (Phonak)",          role: "Parent" },
  { ticker: "DEMANT.CO", name: "Demant A/S",         currency: "DKK", exchange: "Nasdaq Copenhagen",  ciCompany: "Demant (Oticon/Widex)",    role: "Parent" },
  { ticker: "GN.CO",     name: "GN Audio A/S",       currency: "DKK", exchange: "Nasdaq Copenhagen",  ciCompany: "GN (ReSound/Jabra)",       role: "Direct" },
];

// ── In-memory cache ──────────────────────────────────────────────────────────
let cache: StockData | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

// Path to the static JSON file served to the frontend
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const _dir = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
const STOCKS_JSON_PATH = resolve(_dir, "../../stocks.json");
const DIST_STOCKS_JSON_PATH = resolve(_dir, "../../dist/public/stocks.json");

// ── Yahoo Finance helpers ────────────────────────────────────────────────────
const YF_BASE = "https://query1.finance.yahoo.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; CI-Pulse/1.0)",
  "Accept": "application/json",
};

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function fetchQuote(ticker: string): Promise<Partial<StockQuote>> {
  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`;
    const data = await fetchJSON(url);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("No result");

    const meta = result.meta;
    const price = meta.regularMarketPrice ?? meta.previousClose ?? 0;
    const prevClose = meta.previousClose ?? price;
    const change = price - prevClose;
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    return {
      price:         Math.round(price * 100) / 100,
      change:        Math.round(change * 100) / 100,
      changePercent: Math.round(changePct * 100) / 100,
      marketCap:     meta.marketCap ?? null,
      yearLow:       meta.fiftyTwoWeekLow ?? 0,
      yearHigh:      meta.fiftyTwoWeekHigh ?? 0,
      previousClose: Math.round(prevClose * 100) / 100,
      currency:      meta.currency ?? "USD",
      exchange:      meta.exchangeName ?? meta.fullExchangeName ?? "",
      pe:            null,
    };
  } catch (err: any) {
    console.error(`[stocks] Quote fetch failed for ${ticker}: ${err.message}`);
    return {};
  }
}

async function fetchHistory(ticker: string): Promise<OHLCVPoint[]> {
  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=1y&includePrePost=false`;
    const data = await fetchJSON(url);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("No result");

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    const points: OHLCVPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close == null || isNaN(close)) continue;
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      points.push({ date, close: Math.round(close * 100) / 100 });
    }
    return points.sort((a, b) => a.date.localeCompare(b.date));
  } catch (err: any) {
    console.error(`[stocks] History fetch failed for ${ticker}: ${err.message}`);
    return [];
  }
}

// ── FX rate fetcher ─────────────────────────────────────────────────────────
async function fetchFxRate(pair: string): Promise<number | null> {
  try {
    const d = await fetchJSON(`${YF_BASE}/v8/finance/chart/${pair}?interval=1d&range=5d`);
    const meta = d?.chart?.result?.[0]?.meta;
    return meta?.regularMarketPrice ?? meta?.previousClose ?? null;
  } catch { return null; }
}

const FX_DEFAULTS: Record<string, number> = { CHF: 1.12, DKK: 0.145, EUR: 1.08, USD: 1.0 };

// ── Persist data to stocks.json for static serving ──────────────────────
async function persistStocksJson(data: StockData): Promise<void> {
  try {
    const { writeFile } = await import("fs/promises");
    await writeFile(STOCKS_JSON_PATH, JSON.stringify(data), "utf-8");
    // Also update dist/public/stocks.json if it exists (for static serving)
    await writeFile(DIST_STOCKS_JSON_PATH, JSON.stringify(data), "utf-8").catch(() => {});
    console.log("[stocks] stocks.json persisted");
  } catch (e) {
    console.error("[stocks] Failed to persist stocks.json:", e);
  }
}

// ── Main export ────────────────────────────────────────────────────────────────────
export async function fetchStockData(forceRefresh = false): Promise<StockData> {
  const now = Date.now();
  if (!forceRefresh && cache && now < cacheExpiry) return cache;

  console.log("[stocks] Fetching live stock data...");

  // Fetch FX rates in parallel with quotes
  const [chfUsd, dkkUsd, eurUsd] = await Promise.all([
    fetchFxRate("CHFUSD=X"),
    fetchFxRate("DKKUSD=X"),
    fetchFxRate("EURUSD=X"),
  ]);

  const fxRates: FxRates = {
    CHFUSD:    chfUsd   ?? FX_DEFAULTS.CHF,
    DKKUSD:    dkkUsd   ?? FX_DEFAULTS.DKK,
    EURUSD:    eurUsd   ?? FX_DEFAULTS.EUR,
    fetchedAt: new Date().toISOString(),
  };

  const fxToUsdMap: Record<string, number> = {
    CHF: fxRates.CHFUSD,
    USD: 1.0,
    DKK: fxRates.DKKUSD,
    EUR: fxRates.EURUSD,
  };

  const quotes: (StockQuote & { fxToUsd: number })[] = [];
  const history: Record<string, OHLCVPoint[]> = {};

  await Promise.all(
    CI_STOCKS.map(async (stock) => {
      const [quoteData, historyData] = await Promise.all([
        fetchQuote(stock.ticker),
        fetchHistory(stock.ticker),
      ]);

      const currency = quoteData.currency ?? stock.currency;
      quotes.push({
        ticker:        stock.ticker,
        name:          stock.name,
        currency,
        price:         quoteData.price         ?? 0,
        change:        quoteData.change        ?? 0,
        changePercent: quoteData.changePercent ?? 0,
        marketCap:     quoteData.marketCap     ?? null,
        pe:            quoteData.pe            ?? null,
        yearLow:       quoteData.yearLow       ?? 0,
        yearHigh:      quoteData.yearHigh      ?? 0,
        previousClose: quoteData.previousClose ?? 0,
        exchange:      quoteData.exchange      ?? stock.exchange,
        ciCompany:     stock.ciCompany,
        role:          stock.role,
        fetchedAt:     new Date().toISOString(),
        fxToUsd:       fxToUsdMap[currency] ?? 1.0,
      });

      history[stock.ticker] = historyData;
    })
  );

  quotes.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

  cache = { quotes, history, fxRates, lastUpdated: new Date().toISOString() };
  cacheExpiry = now + CACHE_TTL_MS;

  console.log(`[stocks] Done: ${quotes.length} tickers, FX: CHF=${fxRates.CHFUSD} DKK=${fxRates.DKKUSD} EUR=${fxRates.EURUSD}`);

  // Persist to disk so the static frontend always has fresh data
  persistStocksJson(cache).catch(() => {});

  return cache;
}

// Pre-warm cache on startup, then refresh daily
fetchStockData().catch(() => {});
setInterval(() => {
  console.log("[stocks] Daily scheduled refresh...");
  fetchStockData(true).catch((e) => console.error("[stocks] Daily refresh failed:", e));
}, 24 * 60 * 60 * 1000); // every 24 hours
