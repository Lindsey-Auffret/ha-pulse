import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, gte, lte, like, or, sql } from "drizzle-orm";
import { articles, refreshLogs, type Article, type InsertArticle, type RefreshLog, type InsertRefreshLog } from "@shared/schema";

const DB_PATH = process.env.DATABASE_PATH || "ha-news.db";
const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite);

// Create tables if they don't exist, and run migrations
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    source_category TEXT NOT NULL,
    region TEXT NOT NULL,
    country TEXT NOT NULL,
    published_at TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    is_new INTEGER NOT NULL DEFAULT 1,
    tags TEXT NOT NULL DEFAULT '[]',
    manufacturers TEXT NOT NULL DEFAULT '[]',
    image_url TEXT
  );
  CREATE TABLE IF NOT EXISTS refresh_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    articles_added INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    error_message TEXT
  );
`);

// Migration: add manufacturers column to existing DBs
try { sqlite.exec(`ALTER TABLE articles ADD COLUMN manufacturers TEXT NOT NULL DEFAULT '[]'`); } catch {}

export interface IStorage {
  // Articles
  getArticles(filters?: {
    region?: string;
    country?: string;
    category?: string;
    manufacturer?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Article[];
  getArticleCount(filters?: {
    region?: string;
    country?: string;
    category?: string;
    manufacturer?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }): number;
  insertArticle(article: InsertArticle): Article | null;
  markAllSeen(): void;
  getNewArticleCount(): number;
  getRegionBreakdown(): { region: string; count: number }[];
  getCategoryBreakdown(): { category: string; count: number }[];
  getTopSources(): { source: string; count: number }[];
  getManufacturerBreakdown(): { manufacturer: string; count: number }[];
  getArticlesByDay(days: number): { date: string; count: number }[];
  getWeeklyNewsSummary(): { week: string; total: number; regulatory: number; clinical: number; financial: number; industry: number; reimbursement: number; general: number; sentimentScore: number }[];
  getLastFetchedAt(): string | null;

  // Refresh logs
  createRefreshLog(): RefreshLog;
  updateRefreshLog(id: number, update: Partial<RefreshLog>): void;
  getLatestRefreshLog(): RefreshLog | null;
}

export const storage: IStorage = {
  getArticles(filters = {}) {
    let query = db.select().from(articles);
    const conditions = [];

    if (filters.region && filters.region !== "All") {
      conditions.push(eq(articles.region, filters.region));
    }
    if (filters.country && filters.country !== "All") {
      conditions.push(eq(articles.country, filters.country));
    }
    if (filters.category && filters.category !== "All") {
      conditions.push(eq(articles.sourceCategory, filters.category));
    }
    if (filters.manufacturer && filters.manufacturer !== "All") {
      if (filters.manufacturer === "General Industry") {
        conditions.push(eq(articles.sourceCategory, "industry"));
        conditions.push(or(eq(articles.manufacturers, "[]"), eq(articles.manufacturers, "")));
      } else {
        conditions.push(like(articles.manufacturers, `%${filters.manufacturer}%`));
      }
    }
    if (filters.search) {
      conditions.push(
        or(
          like(articles.title, `%${filters.search}%`),
          like(articles.summary, `%${filters.search}%`),
          like(articles.source, `%${filters.search}%`)
        )
      );
    }
    if (filters.dateFrom) {
      conditions.push(gte(articles.publishedAt, filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(lte(articles.publishedAt, filters.dateTo));
    }

    if (conditions.length > 0) {
      // @ts-ignore
      query = query.where(and(...conditions));
    }

    // @ts-ignore
    return query
      .orderBy(desc(articles.publishedAt))
      .limit(filters.limit || 50)
      .offset(filters.offset || 0)
      .all();
  },

  getArticleCount(filters = {}) {
    let query = db.select({ count: sql<number>`count(*)` }).from(articles);
    const conditions = [];

    if (filters.region && filters.region !== "All") {
      conditions.push(eq(articles.region, filters.region));
    }
    if (filters.country && filters.country !== "All") {
      conditions.push(eq(articles.country, filters.country));
    }
    if (filters.category && filters.category !== "All") {
      conditions.push(eq(articles.sourceCategory, filters.category));
    }
    if (filters.manufacturer && filters.manufacturer !== "All") {
      if (filters.manufacturer === "General Industry") {
        conditions.push(eq(articles.sourceCategory, "industry"));
        conditions.push(or(eq(articles.manufacturers, "[]"), eq(articles.manufacturers, "")));
      } else {
        conditions.push(like(articles.manufacturers, `%${filters.manufacturer}%`));
      }
    }
    if (filters.search) {
      conditions.push(
        or(
          like(articles.title, `%${filters.search}%`),
          like(articles.summary, `%${filters.search}%`),
          like(articles.source, `%${filters.search}%`)
        )
      );
    }
    if (filters.dateFrom) {
      conditions.push(gte(articles.publishedAt, filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(lte(articles.publishedAt, filters.dateTo));
    }

    if (conditions.length > 0) {
      // @ts-ignore
      query = query.where(and(...conditions));
    }

    // @ts-ignore
    const result = query.get();
    return result?.count || 0;
  },

  insertArticle(article) {
    try {
      return db.insert(articles).values(article).returning().get();
    } catch {
      return null; // duplicate URL
    }
  },

  markAllSeen() {
    sqlite.exec("UPDATE articles SET is_new = 0");
  },

  getNewArticleCount() {
    const result = sqlite.prepare("SELECT COUNT(*) as count FROM articles WHERE is_new = 1").get() as { count: number };
    return result.count;
  },

  getRegionBreakdown() {
    return sqlite.prepare(
      "SELECT region, COUNT(*) as count FROM articles GROUP BY region ORDER BY count DESC"
    ).all() as { region: string; count: number }[];
  },

  getCategoryBreakdown() {
    return sqlite.prepare(
      "SELECT source_category as category, COUNT(*) as count FROM articles GROUP BY source_category ORDER BY count DESC"
    ).all() as { category: string; count: number }[];
  },

  getTopSources() {
    return sqlite.prepare(
      "SELECT source, COUNT(*) as count FROM articles GROUP BY source ORDER BY count DESC LIMIT 10"
    ).all() as { source: string; count: number }[];
  },

  getManufacturerBreakdown() {
    // Each article can mention multiple manufacturers stored as JSON array
    // We use a simple approach: count occurrences of each known manufacturer name in the manufacturers column
    const mfrs = ["Advanced Bionics", "Cochlear Ltd", "MED-EL", "Sonova", "Oticon Medical", "Envoy Medical", "Nurotron"];
    const result: { manufacturer: string; count: number }[] = [];
    for (const mfr of mfrs) {
      const row = sqlite.prepare(
        `SELECT COUNT(*) as count FROM articles WHERE manufacturers LIKE ?`
      ).get(`%${mfr}%`) as { count: number };
      if (row.count > 0) result.push({ manufacturer: mfr, count: row.count });
    }
    // Also count "General Industry" (articles with no specific manufacturer)
    const noMfr = sqlite.prepare(
      `SELECT COUNT(*) as count FROM articles WHERE (manufacturers = '[]' OR manufacturers = '') AND source_category = 'industry'`
    ).get() as { count: number };
    if (noMfr.count > 0) result.push({ manufacturer: "General Industry", count: noMfr.count });
    return result.sort((a, b) => b.count - a.count);
  },

  getArticlesByDay(days) {
    return sqlite.prepare(
      `SELECT date(published_at) as date, COUNT(*) as count 
       FROM articles 
       WHERE published_at >= date('now', '-${days} days')
       GROUP BY date(published_at)
       ORDER BY date ASC`
    ).all() as { date: string; count: number }[];
  },

  createRefreshLog() {
    return db.insert(refreshLogs).values({
      startedAt: new Date().toISOString(),
      status: "running",
      articlesAdded: 0,
    }).returning().get();
  },

  updateRefreshLog(id, update) {
    db.update(refreshLogs)
      .set(update)
      .where(eq(refreshLogs.id, id))
      .run();
  },

  getLatestRefreshLog() {
    return db.select().from(refreshLogs).orderBy(desc(refreshLogs.startedAt)).limit(1).get() || null;
  },

  getManufacturerComparison(mfrA: string, mfrB: string) {
    const POSITIVE_WORDS = ["approval", "approved", "launch", "launched", "expand", "growth", "record", "milestone", "breakthrough", "advance", "success", "positive", "benefit", "recommend", "leading", "first", "award", "innovation", "improved", "partnership", "agreement", "funding", "coverage", "cleared", "designated", "gain", "win", "pioneer"];
    const NEGATIVE_WORDS = ["recall", "failure", "concern", "risk", "lawsuit", "litigation", "deficit", "loss", "decline", "problem", "issue", "delay", "reject", "denied", "withdrawn", "adverse", "defect", "complaint", "warning", "fine", "penalty", "fail"];

    function scoreSentiment(title: string, summary: string): number {
      const text = `${title} ${summary}`.toLowerCase();
      let score = 0;
      for (const w of POSITIVE_WORDS) if (text.includes(w)) score++;
      for (const w of NEGATIVE_WORDS) if (text.includes(w)) score--;
      return score;
    }

    function getStats(mfr: string) {
      let whereClause: string;
      let params: string[];
      if (mfr === "General Industry") {
        whereClause = `(manufacturers = '[]' OR manufacturers = '') AND source_category = 'industry'`;
        params = [];
      } else {
        whereClause = `manufacturers LIKE ?`;
        params = [`%${mfr}%`];
      }

      // Total count
      const totalRow = sqlite.prepare(`SELECT COUNT(*) as count FROM articles WHERE ${whereClause}`).get(...params) as { count: number };
      const total = totalRow.count;

      // Category breakdown
      const categories = sqlite.prepare(
        `SELECT source_category as category, COUNT(*) as count FROM articles WHERE ${whereClause} GROUP BY source_category ORDER BY count DESC`
      ).all(...params) as { category: string; count: number }[];

      // Region breakdown
      const regions = sqlite.prepare(
        `SELECT region, COUNT(*) as count FROM articles WHERE ${whereClause} GROUP BY region ORDER BY count DESC`
      ).all(...params) as { region: string; count: number }[];

      // Volume by month (last 12 months)
      const volumeByMonth = sqlite.prepare(
        `SELECT strftime('%Y-%m', published_at) as month, COUNT(*) as count 
         FROM articles WHERE ${whereClause} AND published_at >= date('now', '-12 months')
         GROUP BY month ORDER BY month ASC`
      ).all(...params) as { month: string; count: number }[];

      // Volume by week (last 12 weeks)
      const volumeByWeek = sqlite.prepare(
        `SELECT strftime('%Y-W%W', published_at) as week, COUNT(*) as count 
         FROM articles WHERE ${whereClause} AND published_at >= date('now', '-12 weeks')
         GROUP BY week ORDER BY week ASC`
      ).all(...params) as { week: string; count: number }[];

      // Sentiment: fetch all articles for this mfr and score
      const rows = sqlite.prepare(
        `SELECT title, summary, published_at FROM articles WHERE ${whereClause} ORDER BY published_at DESC`
      ).all(...params) as { title: string; summary: string; published_at: string }[];

      let posCount = 0, negCount = 0, neutCount = 0;
      const sentimentByMonth: Record<string, { pos: number; neg: number; neut: number; score: number; count: number }> = {};

      for (const row of rows) {
        const s = scoreSentiment(row.title, row.summary);
        if (s > 0) posCount++;
        else if (s < 0) negCount++;
        else neutCount++;

        const month = row.published_at.slice(0, 7);
        if (!sentimentByMonth[month]) sentimentByMonth[month] = { pos: 0, neg: 0, neut: 0, score: 0, count: 0 };
        sentimentByMonth[month].count++;
        sentimentByMonth[month].score += s;
        if (s > 0) sentimentByMonth[month].pos++;
        else if (s < 0) sentimentByMonth[month].neg++;
        else sentimentByMonth[month].neut++;
      }

      const sentimentTrend = Object.entries(sentimentByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, v]) => ({
          month,
          score: v.count > 0 ? Math.round((v.score / v.count) * 100) / 100 : 0,
          positive: v.pos,
          negative: v.neg,
          neutral: v.neut,
          total: v.count,
        }));

      // Top sources
      const topSources = sqlite.prepare(
        `SELECT source, COUNT(*) as count FROM articles WHERE ${whereClause} GROUP BY source ORDER BY count DESC LIMIT 5`
      ).all(...params) as { source: string; count: number }[];

      // Recent articles (5 latest)
      const recentArticles = sqlite.prepare(
        `SELECT title, url, source_category as sourceCategory, published_at as publishedAt, region, country
         FROM articles WHERE ${whereClause} ORDER BY published_at DESC LIMIT 5`
      ).all(...params) as { title: string; url: string; sourceCategory: string; publishedAt: string; region: string; country: string }[];

      const overallSentimentScore = rows.length > 0
        ? Math.round((rows.reduce((acc, r) => acc + scoreSentiment(r.title, r.summary), 0) / rows.length) * 100) / 100
        : 0;

      return {
        total,
        categories,
        regions,
        volumeByMonth,
        volumeByWeek,
        sentimentTrend,
        topSources,
        recentArticles,
        sentimentSummary: { positive: posCount, negative: negCount, neutral: neutCount, score: overallSentimentScore },
      };
    }

    return {
      mfrA: { name: mfrA, ...getStats(mfrA) },
      mfrB: { name: mfrB, ...getStats(mfrB) },
    };
  },

  getLastFetchedAt() {
    const row = sqlite.prepare('SELECT MAX(fetched_at) as latest FROM articles').get() as { latest: string | null };
    return row?.latest ?? null;
  },

  getWeeklyNewsSummary() {
    // Pull all articles with their category, title, summary, and published date
    const rows = sqlite.prepare(
      `SELECT source_category, title, summary, published_at
       FROM articles
       ORDER BY published_at ASC`
    ).all() as { source_category: string; title: string; summary: string; published_at: string }[];

    // Sentiment keywords (mirrors the existing scoreSentiment logic)
    const POS = ["approval","approved","launch","growth","positive","benefit","improvement","success","milestone","breakthrough","expand","innovation","gain","record","strong"];
    const NEG = ["recall","warning","adverse","complication","decline","loss","risk","concern","delay","failure","slump","headwind","cut","downgrade","miss"];

    function score(title: string, summary: string): number {
      const t = (title + " " + summary).toLowerCase();
      let s = 50;
      POS.forEach(w => { if (t.includes(w)) s += 5; });
      NEG.forEach(w => { if (t.includes(w)) s -= 5; });
      return Math.max(0, Math.min(100, s));
    }

    // Group by ISO week (Monday)
    const weekMap = new Map<string, { total: number; regulatory: number; clinical: number; financial: number; industry: number; reimbursement: number; general: number; scores: number[] }>();

    for (const row of rows) {
      if (!row.published_at) continue;
      const d = new Date(row.published_at);
      if (isNaN(d.getTime())) continue;
      // Get Monday of the week
      const day = d.getUTCDay();
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
      const weekKey = monday.toISOString().slice(0, 10);

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { total: 0, regulatory: 0, clinical: 0, financial: 0, industry: 0, reimbursement: 0, general: 0, scores: [] });
      }
      const w = weekMap.get(weekKey)!;
      w.total++;
      const cat = (row.source_category || "general").toLowerCase();
      if (cat in w) (w as any)[cat]++;
      else w.general++;
      w.scores.push(score(row.title, row.summary));
    }

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, w]) => ({
        week,
        total: w.total,
        regulatory: w.regulatory,
        clinical: w.clinical,
        financial: w.financial,
        industry: w.industry,
        reimbursement: w.reimbursement,
        general: w.general,
        sentimentScore: w.scores.length ? Math.round(w.scores.reduce((a, b) => a + b, 0) / w.scores.length) : 50,
      }));
  },
};
