/**
 * AppShell — shared sidebar + page layout wrapper
 * Used by both Dashboard and Compare pages so navigation persists.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────
interface StatsData {
  total: number;
  newCount: number;
  regionBreakdown: { region: string; count: number }[];
  categoryBreakdown: { category: string; count: number }[];
  manufacturerBreakdown: { manufacturer: string; count: number }[];
  lastRefresh: { completedAt: string; status: string; articlesAdded: number } | null;
  lastFetchedAt?: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────
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

const REGION_COLORS: Record<string, string> = {
  "North America": "#0f8090",
  "Europe": "#2da0b0",
  "Asia-Pacific": "#5bbfcc",
  "Global": "#8dd8e2",
  "Latin America": "#3d9f6b",
  "Middle East & Africa": "#b8906a",
};

const CATEGORY_LABELS: Record<string, string> = {
  financial: "Financial",
  regulatory: "Regulatory",
  reimbursement: "Reimbursement",
  clinical: "Clinical",
  industry: "Industry",
  general: "General",
};

// ── Logo ────────────────────────────────────────────────────────────────────
function HAPulseLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="HA Pulse logo">
      <path d="M6 26 L6 14 Q6 6 14 6 Q22 6 22 14 L22 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
      <circle cx="22" cy="22" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="22" cy="22" r="1.5" fill="currentColor" />
      <path d="M2 18 Q5 12 8 18 Q11 24 14 18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Theme ───────────────────────────────────────────────────────────────────
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");
  return { theme, toggle };
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar() {
  const [location] = useLocation();
  const { data: stats, isLoading: statsLoading } = useQuery<StatsData>({
    queryKey: ["/api/stats"],
    refetchInterval: 120000,
  });

  const isActive = (path: string) => location === path;

  return (
    <aside className="w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col overflow-y-auto overscroll-contain">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
        <div className="text-sidebar-primary">
          <HAPulseLogo size={26} />
        </div>
        <div>
          <div className="text-sm font-bold text-sidebar-foreground leading-none">HA Pulse</div>
          <div className="text-[10px] text-sidebar-foreground/50 mt-0.5">Hearing Aid Intelligence</div>
        </div>
      </div>

      {/* Navigation links */}
      <div className="px-3 py-3 border-b border-sidebar-border space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold px-1 mb-2">Navigation</div>
        <Link href="/">
          <a className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive("/")
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          }`}>
            {/* Feed icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            News Feed
          </a>
        </Link>
        <Link href="/compare">
          <a className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive("/compare")
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          }`}>
            {/* Compare icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 16 12 14 15 10 9 8 12 2 12" />
            </svg>
            Compare
          </a>
        </Link>
        <Link href="/stocks">
          <a className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive("/stocks")
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          }`}>
            {/* Stocks / candlestick icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 20V10" /><path d="M18 4v2" /><circle cx="18" cy="7" r="2" />
              <path d="M6 20v-2" /><path d="M6 14V4" /><circle cx="6" cy="17" r="2" />
              <path d="M12 20v-8" /><path d="M12 8V4" /><circle cx="12" cy="11" r="2" />
            </svg>
            Market Tracker
          </a>
        </Link>
        <Link href="/correlation">
          <a className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive("/correlation")
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          }`}>
            {/* Correlation / scatter icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="7" cy="17" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="10" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="14" cy="9" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="18" cy="6" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none" />
              <line x1="4" y1="20" x2="20" y2="4" strokeDasharray="3 2" strokeOpacity="0.5" />
            </svg>
            Correlation
          </a>
        </Link>
      </div>

      {/* Stats overview */}
      <div className="px-3 py-4 space-y-3 border-b border-sidebar-border">
        <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold px-1 mb-2">Overview</div>
        {statsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full bg-sidebar-accent" />
            <Skeleton className="h-10 w-full bg-sidebar-accent" />
          </div>
        ) : (
          <>
            <div className="bg-sidebar-accent rounded-lg px-3 py-2">
              <div className="text-[10px] text-sidebar-foreground/50">Total Articles</div>
              <div className="text-lg font-bold tabular-nums text-sidebar-foreground">{stats?.total ?? "—"}</div>
            </div>
            <div className="bg-primary/20 rounded-lg px-3 py-2">
              <div className="text-[10px] text-primary/70">New Since Last Visit</div>
              <div className="text-lg font-bold tabular-nums text-sidebar-primary">{stats?.newCount ?? "—"}</div>
            </div>
          </>
        )}
      </div>

      {/* Region breakdown */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold mb-3">By Region</div>
        {statsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-5 w-full bg-sidebar-accent" />)}
          </div>
        ) : (
          <div className="space-y-0.5">
            {(stats?.regionBreakdown || []).map(r => (
              <div key={r.region} className="flex items-center gap-2 py-1">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: REGION_COLORS[r.region] || "#888" }} />
                <span className="text-xs text-foreground flex-1 truncate">{r.region}</span>
                <span className="text-xs tabular-nums text-muted-foreground font-medium">{r.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category breakdown */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold mb-3">By Category</div>
        {statsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-5 w-full bg-sidebar-accent" />)}
          </div>
        ) : (
          <div className="space-y-1">
            {(stats?.categoryBreakdown || []).map(c => (
              <div key={c.category} className="flex items-center justify-between py-0.5">
                <span className="text-xs text-sidebar-foreground/70">{CATEGORY_LABELS[c.category] || c.category}</span>
                <span className="text-xs tabular-nums text-sidebar-primary font-medium">{c.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manufacturer breakdown */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold mb-3">By Manufacturer</div>
        {statsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-5 w-full bg-sidebar-accent" />)}
          </div>
        ) : (
          <div className="space-y-0.5">
            {(stats?.manufacturerBreakdown || []).map(m => (
              <Link key={m.manufacturer} href="/compare">
                <a className="w-full flex items-center gap-2 py-1 rounded px-1 text-left transition-colors hover:bg-sidebar-accent/50 cursor-pointer">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: MANUFACTURER_COLORS[m.manufacturer] || "#888" }}
                  />
                  <span className="text-xs text-sidebar-foreground/80 flex-1 truncate">{m.manufacturer}</span>
                  <span className="text-xs tabular-nums font-medium" style={{ color: MANUFACTURER_COLORS[m.manufacturer] || "hsl(var(--sidebar-primary))" }}>
                    {m.count}
                  </span>
                </a>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Last refresh */}
      <div className="px-4 py-3 mt-auto border-t border-sidebar-border">
        <div className="text-[10px] text-sidebar-foreground/40 mb-1">Last refreshed</div>
        <div className="text-[11px] text-sidebar-foreground/60">
          {(stats?.lastFetchedAt || stats?.lastRefresh?.completedAt)
            ? format(parseISO((stats.lastFetchedAt || stats.lastRefresh!.completedAt)!), "dd MMM, HH:mm")
            : "—"}
        </div>
      </div>
    </aside>
  );
}

// ── AppShell ─────────────────────────────────────────────────────────────────
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      {children}
    </div>
  );
}
