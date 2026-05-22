import Parser from "rss-parser";
import { storage } from "./storage";
import type { InsertArticle } from "@shared/schema";

const parser = new Parser({ timeout: 10000 });

// Region/country classification
const REGION_MAP: Record<string, { region: string; country: string }> = {
  // North America
  usa: { region: "North America", country: "USA" },
  "united states": { region: "North America", country: "USA" },
  america: { region: "North America", country: "USA" },
  fda: { region: "North America", country: "USA" },
  medicare: { region: "North America", country: "USA" },
  medicaid: { region: "North America", country: "USA" },
  canada: { region: "North America", country: "Canada" },
  // Europe
  europe: { region: "Europe", country: "Europe" },
  uk: { region: "Europe", country: "UK" },
  "united kingdom": { region: "Europe", country: "UK" },
  "great britain": { region: "Europe", country: "UK" },
  nice: { region: "Europe", country: "UK" },
  nhs: { region: "Europe", country: "UK" },
  germany: { region: "Europe", country: "Germany" },
  german: { region: "Europe", country: "Germany" },
  france: { region: "Europe", country: "France" },
  french: { region: "Europe", country: "France" },
  spain: { region: "Europe", country: "Spain" },
  spanish: { region: "Europe", country: "Spain" },
  italy: { region: "Europe", country: "Italy" },
  italian: { region: "Europe", country: "Italy" },
  netherlands: { region: "Europe", country: "Netherlands" },
  belgium: { region: "Europe", country: "Belgium" },
  sweden: { region: "Europe", country: "Sweden" },
  norway: { region: "Europe", country: "Norway" },
  denmark: { region: "Europe", country: "Denmark" },
  switzerland: { region: "Europe", country: "Switzerland" },
  ema: { region: "Europe", country: "Europe" },
  // Asia-Pacific
  china: { region: "Asia-Pacific", country: "China" },
  chinese: { region: "Asia-Pacific", country: "China" },
  japan: { region: "Asia-Pacific", country: "Japan" },
  japanese: { region: "Asia-Pacific", country: "Japan" },
  australia: { region: "Asia-Pacific", country: "Australia" },
  australian: { region: "Asia-Pacific", country: "Australia" },
  msac: { region: "Asia-Pacific", country: "Australia" },
  india: { region: "Asia-Pacific", country: "India" },
  indian: { region: "Asia-Pacific", country: "India" },
  "south korea": { region: "Asia-Pacific", country: "South Korea" },
  korean: { region: "Asia-Pacific", country: "South Korea" },
  singapore: { region: "Asia-Pacific", country: "Singapore" },
  // Latin America
  brazil: { region: "Latin America", country: "Brazil" },
  mexico: { region: "Latin America", country: "Mexico" },
  argentina: { region: "Latin America", country: "Argentina" },
  // Middle East & Africa
  "middle east": { region: "Middle East & Africa", country: "Middle East" },
  africa: { region: "Middle East & Africa", country: "Africa" },
  "saudi arabia": { region: "Middle East & Africa", country: "Saudi Arabia" },
  uae: { region: "Middle East & Africa", country: "UAE" },
};

// Parent company detection — maps to HA manufacturer they own
const PARENT_COMPANY_MAP: { key: string; name: string }[] = [
  { key: "sonova group", name: "Phonak" },
  { key: "sonova ag", name: "Phonak" },
  { key: "william demant", name: "Oticon" },
  { key: "demant a/s", name: "Oticon" },
  { key: "ws audiology", name: "Widex" },
  { key: "gn audio", name: "ReSound" },
  { key: "gn store nord", name: "ReSound" },
  { key: "soon.sw", name: "Phonak" },
  { key: "demant.co", name: "Oticon" },
  { key: "gn.co", name: "ReSound" },
  // Peripheral competitor parent companies
  { key: "apple inc", name: "Apple" },
  { key: "essilor", name: "Nuance Audio" },
  { key: "essilorluxottica", name: "Nuance Audio" },
  { key: "luxottica", name: "Nuance Audio" },
  { key: "meta platforms", name: "Meta" },
  { key: "sony corporation", name: "Sony" },
  { key: "sony group", name: "Sony" },
  { key: "sennheiser electronic", name: "Sennheiser" },
];

// Manufacturer detection — ordered by specificity (most specific first)
const MANUFACTURER_MAP: { key: string; name: string }[] = [
  // Phonak (Sonova)
  { key: "phonak audeo", name: "Phonak" },
  { key: "phonak lumity", name: "Phonak" },
  { key: "phonak paradise", name: "Phonak" },
  { key: "phonak naida", name: "Phonak" },
  { key: "phonak", name: "Phonak" },
  { key: "lumity hearing", name: "Phonak" },
  { key: "audeo hearing", name: "Phonak" },
  // Oticon (Demant)
  { key: "oticon intent", name: "Oticon" },
  { key: "oticon more", name: "Oticon" },
  { key: "oticon real", name: "Oticon" },
  { key: "opn s hearing", name: "Oticon" },
  { key: "oticon", name: "Oticon" },
  // Widex (WS Audiology)
  { key: "widex moment", name: "Widex" },
  { key: "widex", name: "Widex" },
  // Signia (WS Audiology)
  { key: "signia styletto", name: "Signia" },
  { key: "signia pure", name: "Signia" },
  { key: "signia", name: "Signia" },
  { key: "siemens hearing", name: "Signia" },
  // Starkey
  { key: "starkey genesis", name: "Starkey" },
  { key: "starkey evolv", name: "Starkey" },
  { key: "starkey", name: "Starkey" },
  { key: "livio edge", name: "Starkey" },
  // ReSound (GN Audio)
  { key: "resound nexia", name: "ReSound" },
  { key: "resound omnia", name: "ReSound" },
  { key: "resound vivia", name: "ReSound" },
  { key: "resound", name: "ReSound" },
  // Jabra Enhance (GN Audio)
  { key: "jabra enhance", name: "Jabra Enhance" },
  // Eargo
  { key: "eargo", name: "Eargo" },
  // ── Peripheral / Emerging Competitors ──────────────────────────────
  // Fortell (AI-powered startup, launched Dec 2025)
  { key: "fortell hearing", name: "Fortell" },
  { key: "fortell spatial ai", name: "Fortell" },
  { key: "fortell", name: "Fortell" },
  // Apple (AirPods Pro 2, FDA-cleared OTC hearing aid software Sept 2024)
  { key: "airpods pro hearing aid", name: "Apple" },
  { key: "airpods hearing aid", name: "Apple" },
  { key: "apple hearing aid feature", name: "Apple" },
  { key: "apple airpods hearing", name: "Apple" },
  { key: "apple hearing feature", name: "Apple" },
  // Nuance Audio (EssilorLuxottica — FDA-cleared OTC hearing glasses)
  { key: "nuance audio", name: "Nuance Audio" },
  { key: "nuanceaudio", name: "Nuance Audio" },
  { key: "luxottica hearing", name: "Nuance Audio" },
  { key: "hearing glasses luxottica", name: "Nuance Audio" },
  { key: "hearing glasses essilor", name: "Nuance Audio" },
  // Meta (Ray-Ban smart glasses with Conversation Focus, Dec 2025)
  { key: "meta ray-ban hearing", name: "Meta" },
  { key: "ray-ban conversation focus", name: "Meta" },
  { key: "ray-ban hearing", name: "Meta" },
  { key: "meta conversation focus", name: "Meta" },
  { key: "meta glasses hearing", name: "Meta" },
  // Sony (OTC hearing aids, partnership with WS Audiology)
  { key: "sony cre-", name: "Sony" },
  { key: "sony hearing aid", name: "Sony" },
  { key: "sony hearing", name: "Sony" },
  // Sennheiser (OTC via Sonova partnership)
  { key: "sennheiser all day clear", name: "Sennheiser" },
  { key: "sennheiser hearing", name: "Sennheiser" },
];

function extractManufacturers(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const { key, name } of MANUFACTURER_MAP) {
    if (lower.includes(key)) found.add(name);
  }
  // Also detect via parent companies
  for (const { key, name } of PARENT_COMPANY_MAP) {
    if (lower.includes(key)) found.add(name);
  }
  return Array.from(found);
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // financial must come first — more specific than industry
  financial: [
    "earnings", "revenue", "profit", "loss", "ebit", "ebitda", "net income", "gross margin",
    "quarterly results", "annual results", "fiscal year", "fy2", "q1 ", "q2 ", "q3 ", "q4 ",
    "guidance", "outlook", "forecast", "analyst", "rating", "price target", "buy rating",
    "sell rating", "hold rating", "upgrade", "downgrade", "eps", "shares", "stock",
    "investor", "shareholder", "dividend", "buyback", "ipo", "acquisition", "merger",
    "acqui", "divest", "joint venture", "licensing deal", "funding", "series a", "series b",
    "series c", "venture", "private equity", "valuation", "market cap", "soon.sw",
    "demant.co", "gn.co", "sonova group", "william demant", "demant", "gn audio",
    "financial results", "full year results",
  ],
  regulatory: ["fda", "ema", "ce mark", "approval", "cleared", "510k", "breakthrough device", "pma", "mhra", "tga", "indication", "labeled", "authorized"],
  reimbursement: ["reimburs", "insurance", "coverage", "medicare", "medicaid", "nice", "msac", "iqwig", "hta", "policy", "payment", "payer", "cms", "apc", "drg"],
  clinical: ["trial", "study", "research", "outcome", "efficacy", "safety", "patient", "audiolog", "hearing loss", "snhl", "tinnitus", "audiogram", "fitting", "otology"],
  industry: ["launch", "partner", "market", "phonak", "oticon", "widex", "signia", "starkey", "resound", "jabra", "eargo", "fortell", "sonova", "demant", "gn audio", "airpods hearing", "nuance audio", "ray-ban hearing", "sony hearing", "sennheiser hearing"],
};

// RSS and news sources for Hearing Aids
interface NewsSource {
  name: string;
  url: string;
  category: string;
  defaultRegion: string;
  defaultCountry: string;
}

const NEWS_SOURCES: NewsSource[] = [
  // Industry & Clinical publications
  { name: "The Hearing Review", url: "https://hearingreview.com/feed", category: "industry", defaultRegion: "North America", defaultCountry: "USA" },
  { name: "AudiologyOnline", url: "https://www.audiologyonline.com/rss/articles.xml", category: "clinical", defaultRegion: "North America", defaultCountry: "USA" },
  { name: "HearingTracker", url: "https://www.hearingtracker.com/feed", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Hearing Health & Technology Matters", url: "https://hearinghealthmatters.org/feed", category: "clinical", defaultRegion: "North America", defaultCountry: "USA" },
  // General medical / device news
  { name: "BioSpace", url: "https://www.biospace.com/rss/news/", category: "industry", defaultRegion: "North America", defaultCountry: "USA" },
  { name: "MedCity News", url: "https://medcitynews.com/feed/", category: "industry", defaultRegion: "North America", defaultCountry: "USA" },
  { name: "Medical Device Network", url: "https://www.medicaldevice-network.com/feed/", category: "regulatory", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Fierce Biotech", url: "https://www.fiercebiotech.com/rss/xml", category: "industry", defaultRegion: "North America", defaultCountry: "USA" },
  { name: "Reimbursement Intelligence", url: "https://reimbursementintelligence.com/feed/", category: "reimbursement", defaultRegion: "North America", defaultCountry: "USA" },
  // FDA 510(k) clearances
  { name: "FDA MedWatch", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml", category: "regulatory", defaultRegion: "North America", defaultCountry: "USA" },
  // Google News RSS — HA topics
  { name: "Google News - HA Regulatory", url: "https://news.google.com/rss/search?q=hearing+aid+FDA+approval+510k+reimbursement&hl=en-US&gl=US&ceid=US:en", category: "regulatory", defaultRegion: "North America", defaultCountry: "USA" },
  { name: "Google News - HA Europe", url: "https://news.google.com/rss/search?q=%22hearing+aid%22+Europe+NICE+EMA+reimbursement&hl=en-GB&gl=GB&ceid=GB:en", category: "regulatory", defaultRegion: "Europe", defaultCountry: "Europe" },
  { name: "Google News - HA Asia", url: "https://news.google.com/rss/search?q=%22hearing+aid%22+Asia+China+Japan+Australia+reimbursement&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Asia-Pacific", defaultCountry: "Asia-Pacific" },
  { name: "Google News - HA Global", url: "https://news.google.com/rss/search?q=%22hearing+aid%22&hl=en-US&gl=US&ceid=US:en&tbs=qdr:w", category: "general", defaultRegion: "Global", defaultCountry: "Global" },
  // Core manufacturer Google News feeds
  { name: "Google News - Phonak", url: "https://news.google.com/rss/search?q=%22Phonak%22+hearing&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Oticon", url: "https://news.google.com/rss/search?q=%22Oticon%22+%22hearing+aid%22&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Widex", url: "https://news.google.com/rss/search?q=%22Widex%22+%22hearing+aid%22&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Signia", url: "https://news.google.com/rss/search?q=%22Signia%22+%22hearing+aid%22&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Starkey", url: "https://news.google.com/rss/search?q=%22Starkey%22+%22hearing+aid%22&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "North America", defaultCountry: "USA" },
  { name: "Google News - ReSound", url: "https://news.google.com/rss/search?q=%22ReSound%22+OR+%22GN+Audio%22+%22hearing%22&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Jabra Enhance", url: "https://news.google.com/rss/search?q=%22Jabra+Enhance%22+hearing&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Eargo", url: "https://news.google.com/rss/search?q=%22Eargo%22+hearing+aid&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "North America", defaultCountry: "USA" },
  { name: "Google News - Fortell", url: "https://news.google.com/rss/search?q=%22Fortell%22+hearing&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  // Peripheral / emerging competitor Google News feeds
  { name: "Google News - Apple Hearing", url: "https://news.google.com/rss/search?q=%22AirPods%22+%22hearing+aid%22+OR+%22Apple+hearing%22&hl=en-US&gl=US&ceid=US:en", category: "regulatory", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Nuance Audio", url: "https://news.google.com/rss/search?q=%22Nuance+Audio%22+OR+%22EssilorLuxottica%22+hearing&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Meta Hearing", url: "https://news.google.com/rss/search?q=%22Ray-Ban%22+%22hearing%22+OR+%22conversation+focus%22+hearing&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Sony Hearing", url: "https://news.google.com/rss/search?q=%22Sony%22+%22hearing+aid%22+OR+%22Sony+CRE%22&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Sennheiser Hearing", url: "https://news.google.com/rss/search?q=%22Sennheiser%22+%22hearing+aid%22+OR+%22All+Day+Clear%22&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - OTC Hearing", url: "https://news.google.com/rss/search?q=%22over-the-counter+hearing+aid%22+OR+%22OTC+hearing%22+2026&hl=en-US&gl=US&ceid=US:en", category: "industry", defaultRegion: "North America", defaultCountry: "USA" },
  // Investor/financial news
  { name: "Sonova IR", url: "https://www.sonova.com/en/rss/investor-news", category: "financial", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Sonova Finance", url: "https://news.google.com/rss/search?q=%22Sonova%22+OR+%22SOON.SW%22+earnings+OR+revenue+OR+results+OR+acquisition&hl=en-US&gl=US&ceid=US:en", category: "financial", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - Demant Finance", url: "https://news.google.com/rss/search?q=%22Demant%22+OR+%22DEMANT.CO%22+earnings+OR+revenue+OR+results+OR+hearing&hl=en-US&gl=US&ceid=US:en", category: "financial", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - GN Finance", url: "https://news.google.com/rss/search?q=%22GN+Audio%22+OR+%22GN.CO%22+earnings+OR+revenue+OR+results+OR+hearing&hl=en-US&gl=US&ceid=US:en", category: "financial", defaultRegion: "Global", defaultCountry: "Global" },
  { name: "Google News - HA Finance", url: "https://news.google.com/rss/search?q=%22hearing+aid%22+acquisition+OR+merger+OR+funding+OR+investor+OR+earnings&hl=en-US&gl=US&ceid=US:en", category: "financial", defaultRegion: "Global", defaultCountry: "Global" },
];

function classifyRegion(text: string): { region: string; country: string } {
  const lower = text.toLowerCase();
  for (const [keyword, mapping] of Object.entries(REGION_MAP)) {
    if (lower.includes(keyword)) return mapping;
  }
  return { region: "Global", country: "Global" };
}

function classifyCategory(text: string, defaultCategory: string): string {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return defaultCategory;
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();
  const tagMap: Record<string, string> = {
    // Core brands
    "phonak": "Phonak",
    "oticon": "Oticon",
    "widex": "Widex",
    "signia": "Signia",
    "starkey": "Starkey",
    "resound": "ReSound",
    "jabra enhance": "Jabra Enhance",
    "eargo": "Eargo",
    // Peripheral competitors
    "fortell": "Fortell",
    "airpods hearing": "Apple",
    "apple hearing": "Apple",
    "nuance audio": "Nuance Audio",
    "ray-ban hearing": "Meta",
    "conversation focus": "Meta",
    "sony hearing": "Sony",
    "sony cre": "Sony",
    "sennheiser hearing": "Sennheiser",
    // Regulatory
    "fda": "FDA",
    "ema": "EMA",
    "nice": "NICE",
    "msac": "MSAC",
    "medicare": "Medicare",
    "medicaid": "Medicaid",
    "hta": "HTA",
    "510k": "510(k)",
    // Clinical
    "tinnitus": "Tinnitus",
    "pediatric": "Pediatric",
    "children": "Pediatric",
    "adult": "Adult",
    "reimburs": "Reimbursement",
    "clinical trial": "Clinical Trial",
    "approval": "Approval",
    // Technology
    "over-the-counter": "OTC",
    "otc hearing": "OTC",
    "spatial ai": "AI",
    "ai hearing": "AI",
    "bluetooth": "Bluetooth",
    "rechargeable": "Rechargeable",
    "hearing glasses": "Hearing Glasses",
    "smart glasses": "Smart Glasses",
  };
  for (const [keyword, tag] of Object.entries(tagMap)) {
    if (lower.includes(keyword) && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, 5);
}

// Keywords that qualify an article as hearing-aid related
const HA_COMPANY_KEYWORDS = [
  // Core hearing aid terms
  "hearing aid", "hearing aids", "hearing device", "hearing devices",
  "audiolog", "hearing loss", "hearing care",
  // Core prescription brands
  "phonak", "oticon", "widex", "signia", "starkey",
  "resound", "jabra enhance", "eargo",
  // Peripheral / emerging competitors
  "fortell",
  "airpods pro hearing", "airpods hearing aid", "apple hearing feature",
  "nuance audio", "nuanceaudio",
  "ray-ban hearing", "conversation focus hearing",
  "sony cre-", "sony hearing",
  "sennheiser all day clear", "sennheiser hearing",
  // Parent companies / tickers / corporate
  "gn audio", "sonova", "demant", "ws audiology",
  "essilor hearing", "luxottica hearing", "essilorluxottica hearing",
  "meta platforms hearing",
  "over-the-counter hearing", "otc hearing",
  // Clinical
  "tinnitus", "sensorineural", "conductive hearing",
  // Parent company tickers
  "soon.sw", "demant.co", "gn.co",
];

function isHearingAidRelated(title: string, summary: string): boolean {
  const text = `${title} ${summary}`.toLowerCase();
  return HA_COMPANY_KEYWORDS.some(k => text.includes(k));
}

export async function fetchAndIngestNews(): Promise<{ added: number; total: number }> {
  let added = 0;
  let total = 0;

  for (const source of NEWS_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      const items = feed.items?.slice(0, 20) || [];

      for (const item of items) {
        total++;
        const title = item.title || "";
        const summary = item.contentSnippet || item.content || item.summary || "";
        const url = item.link || "";
        const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

        if (!title || !url) continue;
        if (!isHearingAidRelated(title, summary)) continue;

        const regionData = classifyRegion(`${title} ${summary}`);
        const finalRegion = regionData.region === "Global" ? source.defaultRegion : regionData.region;
        const finalCountry = regionData.country === "Global" ? source.defaultCountry : regionData.country;
        const category = classifyCategory(`${title} ${summary}`, source.category);
        const tags = extractTags(`${title} ${summary}`);
        const mfrs = extractManufacturers(`${title} ${summary}`);

        const article: InsertArticle = {
          title: title.slice(0, 500),
          summary: summary.slice(0, 1000) || "No summary available.",
          url,
          source: source.name,
          sourceCategory: category,
          region: finalRegion,
          country: finalCountry,
          publishedAt,
          fetchedAt: new Date().toISOString(),
          isNew: true,
          tags: JSON.stringify(tags),
          manufacturers: JSON.stringify(mfrs),
        };

        const wasInserted = await storage.insertArticleIfNew(article);
        if (wasInserted) added++;
      }
    } catch (err: any) {
      console.error(`[ingest] Failed to fetch ${source.name}: ${err.message}`);
    }
  }

  await storage.recordRefreshRun(added, "success");
  console.log(`[ingest] Done. Added ${added} new articles out of ${total} processed.`);
  return { added, total };
}

// Auto-refresh every 6 hours
setInterval(() => {
  fetchAndIngestNews().catch(console.error);
}, 6 * 60 * 60 * 1000);

// ── Seed on startup ────────────────────────────────────────────────────────
export async function seedIfEmpty(): Promise<void> {
  try {
    const stats = await storage.getStats();
    if (stats.total === 0) {
      console.log("[ingest] DB empty — running initial seed...");
      await fetchAndIngestNews();
    } else {
      console.log(`[ingest] DB has ${stats.total} articles — skipping initial seed`);
    }
  } catch (e) {
    console.error("[ingest] seedIfEmpty error:", e);
  }
}

// ── Backfill manufacturers ─────────────────────────────────────────────────
export async function backfillManufacturers(): Promise<void> {
  try {
    const articles = await storage.getAllArticlesForBackfill();
    let updated = 0;
    for (const article of articles) {
      const mfrs = extractManufacturers(`${article.title} ${article.summary}`);
      if (mfrs.length > 0) {
        await storage.updateArticleManufacturers(article.id, JSON.stringify(mfrs));
        updated++;
      }
    }
    if (updated > 0) console.log(`[ingest] Backfilled manufacturers for ${updated} articles`);
  } catch (e) {
    // Non-critical — storage methods may not exist yet
  }
}
