import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { fetchAndIngestNews, seedIfEmpty, backfillManufacturers } from "./newsIngestion";
import { fetchStockData } from "./stockFetcher";

// Seed on startup
seedIfEmpty();
// Backfill manufacturers for existing articles
backfillManufacturers();
// Fetch live data on startup
fetchAndIngestNews().then(({ added }) => {
  if (added > 0) console.log(`Ingested ${added} new articles on startup`);
}).catch(console.error);

export function registerRoutes(httpServer: Server, app: Express) {
  // GET /api/articles
  app.get("/api/articles", (req, res) => {
    const { region, country, category, manufacturer, search, dateFrom, dateTo, limit, offset } = req.query;
    const filters = {
      region: region as string,
      country: country as string,
      category: category as string,
      manufacturer: manufacturer as string,
      search: search as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    };
    const articles = storage.getArticles(filters);
    const total = storage.getArticleCount(filters);
    res.json({ articles, total });
  });

  // GET /api/stats
  app.get("/api/stats", (req, res) => {
    const total = storage.getArticleCount();
    const newCount = storage.getNewArticleCount();
    const regionBreakdown = storage.getRegionBreakdown();
    const categoryBreakdown = storage.getCategoryBreakdown();
    const topSources = storage.getTopSources();
    const manufacturerBreakdown = storage.getManufacturerBreakdown();
    const last30Days = storage.getArticlesByDay(30);
    const lastRefresh = storage.getLatestRefreshLog();
    const lastFetchedAt = storage.getLastFetchedAt();
    res.json({ total, newCount, regionBreakdown, categoryBreakdown, topSources, manufacturerBreakdown, last30Days, lastRefresh, lastFetchedAt });
  });

  // POST /api/mark-seen
  app.post("/api/mark-seen", (req, res) => {
    storage.markAllSeen();
    res.json({ success: true });
  });

  // POST /api/refresh
  app.post("/api/refresh", async (req, res) => {
    const log = storage.createRefreshLog();
    res.json({ logId: log.id, message: "Refresh started" });

    // Run in background
    fetchAndIngestNews().then(({ added }) => {
      storage.updateRefreshLog(log.id, {
        completedAt: new Date().toISOString(),
        articlesAdded: added,
        status: "completed",
      });
      console.log(`Refresh complete: ${added} new articles`);
    }).catch((err: any) => {
      storage.updateRefreshLog(log.id, {
        completedAt: new Date().toISOString(),
        status: "failed",
        errorMessage: err.message,
      });
    });
  });

  // GET /api/compare?mfrA=X&mfrB=Y
  app.get("/api/compare", (req, res) => {
    const { mfrA, mfrB } = req.query;
    if (!mfrA || !mfrB) {
      return res.status(400).json({ error: "mfrA and mfrB query params are required" });
    }
    try {
      const data = storage.getManufacturerComparison(mfrA as string, mfrB as string);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/refresh/status
  app.get("/api/refresh/status", (req, res) => {
    const latest = storage.getLatestRefreshLog();
    res.json(latest || { status: "never" });
  });

  // GET /api/weekly-news — weekly article volume + sentiment scores from SQLite (live)
  app.get("/api/weekly-news", (_req, res) => {
    try {
      const rows = storage.getWeeklyNewsSummary();
      res.json({ weeks: rows, generatedAt: new Date().toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stocks — live quotes + 1-year OHLCV for all CI public companies
  // Pass ?force=1 to bypass in-memory cache and fetch fresh from Yahoo Finance
  app.get("/api/stocks", async (req, res) => {
    try {
      const force = req.query.force === "1";
      const data = await fetchStockData(force);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
