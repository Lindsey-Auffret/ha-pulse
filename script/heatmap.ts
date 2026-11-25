// Builds dist/public/heatmap.json: signal counts per topic / product / manufacturer per month.
type Art = { title: string; summary: string; url: string; source: string; sourceCategory: string; publishedAt: string; tags: string[]; manufacturers: string[] };
type Rule = RegExp | ((r: { t: string; title: string; cat: string; m: string }) => boolean);

const VIEWS: Record<string, [string, Rule][]> = {
  topic: [
    ["OTC & direct-to-consumer", /\botc\b|over-the-counter|direct-to-consumer|\bdtc\b/i],
    ["AI & sound processing", /\bai\b|artificial intelligence|deep neural|\bdnn\b|machine learning/i],
    ["Hearables & hearing glasses", /airpods|nuance audio|ray-ban|meta\b|smart glasses|hearing glasses|hearable|earbud|samsung galaxy buds/i],
    ["Connectivity (Auracast, Bluetooth)", /auracast|bluetooth|le audio|fast pair|streaming/i],
    ["Product launches", r => /launch|unveil|introduc|new .*hearing aid|platform/i.test(r.title)],
    ["Regulatory", r => r.cat === "regulatory" || /\bfda\b|clearance|510\(k\)|ce mark|\bmdr\b|recall/i.test(r.title)],
    ["Reimbursement & access", r => r.cat === "reimbursement" || /reimburs|medicare|medicaid|\bva\b|veterans|coverage|insurance|subsid|legislation/i.test(r.t)],
    ["Clinical evidence", r => r.cat === "clinical"],
    ["Financial & investor", r => r.cat === "financial"],
    ["M&A & partnerships", /acqui|merger|\bm&a\b|takeover|divest|partnership|joint venture|stake/i],
    ["Retail & distribution", /amplifon|costco|miracle-ear|specsavers|boots|hear\.com|audibene|retail|clinic network|store/i],
  ],
  product: [
    ["Phonak (Infinio, Sphere, EON)", /\bphonak\b|\binfinio\b|\bsphere\b/i],
    ["Oticon (Intent, Zeal, Reveal)", /\boticon\b/i],
    ["Signia (IX, MaX)", /\bsignia\b/i],
    ["Widex (Allure, Moment)", /\bwidex\b/i],
    ["ReSound (Sensia, Vivia)", /\bresound\b/i],
    ["Starkey (Omega AI, Edge AI)", /\bstarkey\b/i],
    ["Apple AirPods hearing aid", /\bairpods\b/i],
    ["Nuance Audio / hearing glasses", /nuance audio|hearing glasses|ray-ban/i],
    ["Eargo", /\beargo\b/i],
    ["Fortell", /\bfortell\b/i],
  ],
  maker: [
    ["Sonova (Phonak, Unitron)", r => /Sonova|Phonak|Unitron/.test(r.m)],
    ["Demant (Oticon, Philips)", r => /Demant|Oticon|Philips/.test(r.m)],
    ["WS Audiology (Signia, Widex)", r => /WS Audiology|WSA|Signia|Widex/.test(r.m)],
    ["GN (ReSound, Jabra, Beltone)", r => /\bGN\b|ReSound|Jabra|Beltone/.test(r.m)],
    ["Starkey", r => /Starkey/.test(r.m)],
    ["Apple", r => /Apple/.test(r.m)],
    ["EssilorLuxottica / Meta", r => /Nuance|EssilorLuxottica|Meta/.test(r.m)],
    ["Amplifon", r => /Amplifon|Miracle-Ear/.test(r.m)],
    ["Eargo", r => /Eargo/.test(r.m)],
    ["Fortell", r => /Fortell/.test(r.m)],
  ],
};

export function buildHeatmap(articles: Art[], monthsBack = 13) {
  const now = new Date();
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const inWin = articles.filter(a => months.includes((a.publishedAt || "").slice(0, 7)));
  const views: Record<string, { name: string; cells: { title: string; source: string; url: string; date: string }[][] }[]> = {};
  for (const [v, defs] of Object.entries(VIEWS)) {
    views[v] = defs.map(([name, rule]) => {
      const cells = months.map(() => [] as any[]);
      for (const a of inWin) {
        // Products match on the headline only, so passing mentions in a summary don't count
        const text = v === "product" ? a.title : `${a.title} ${a.summary} ${(a.tags || []).join(" ")}`;
        const r = { t: text, title: a.title, cat: (a.sourceCategory || "").toLowerCase(), m: (a.manufacturers || []).join(" ") };
        const ok = typeof rule === "function" ? rule(r) : rule.test(r.t);
        if (!ok) continue;
        cells[months.indexOf(a.publishedAt.slice(0, 7))].push({ title: a.title, source: a.source, url: a.url, date: a.publishedAt.slice(0, 10) });
      }
      return { name, cells };
    });
  }
  const totals = months.map(m => inWin.filter(a => a.publishedAt.startsWith(m)).length);
  const latest = inWin.reduce((mx, a) => (a.publishedAt > mx ? a.publishedAt : mx), "").slice(0, 10);
  return { months, views, totals, latestSignal: latest, generatedAt: new Date().toISOString() };
}
