/**
 * Heatmap.tsx — Signal heat map: number of HA Pulse signals per topic / product / manufacturer per month.
 * Data: ./heatmap.json, generated at build time from ha-news.db (script/heatmap.ts).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Item { title: string; source: string; url: string; date: string }
interface Row { name: string; cells: Item[][] }
interface HeatData {
  months: string[];
  views: Record<string, Row[]>;
  totals: number[];
  latestSignal: string;
  generatedAt: string;
}

const VIEWS = [
  { id: "topic", label: "Topic" },
  { id: "product", label: "Product" },
  { id: "maker", label: "Manufacturer" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtMonth = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
const fmtLong = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;

function mix(a: number[], b: number[], t: number) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function Heatmap() {
  const { data, isLoading, isError } = useQuery<HeatData>({
    queryKey: ["heatmap"],
    queryFn: async () => {
      const res = await fetch("./heatmap.json");
      if (!res.ok) throw new Error("Failed to load heat map data");
      return res.json();
    },
    staleTime: Infinity,
  });

  const [view, setView] = useState("topic");
  const [mode, setMode] = useState<"month" | "cum">("month");
  const [upto, setUpto] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<{ row: number; col: number } | null>(null);
  const timer = useRef<number | null>(null);

  const months = data?.months ?? [];
  const last = Math.max(0, months.length - 1);
  const cur = upto ?? last;
  const rows = data?.views[view] ?? [];
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const lo = isDark ? [48, 40, 28] : [250, 244, 232];
  const hi = isDark ? [218, 156, 47] : [166, 104, 14];

  const value = (r: Row, i: number) =>
    mode === "cum" ? r.cells.slice(0, i + 1).reduce((s, c) => s + c.length, 0) : r.cells[i].length;

  const max = useMemo(() => {
    let m = 1;
    rows.forEach(r => months.forEach((_, i) => { m = Math.max(m, value(r, i)); }));
    return m;
  }, [rows, months, mode]);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setUpto(u => {
        const n = (u ?? 0) + 1;
        if (n >= last) { setPlaying(false); return last; }
        return n;
      });
    }, 750);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, last]);

  const play = () => {
    if (playing) { setPlaying(false); return; }
    setUpto(0);
    setPlaying(true);
  };

  const selItems = useMemo(() => {
    if (!sel || !rows[sel.row]) return [];
    const r = rows[sel.row];
    const items = mode === "cum" ? r.cells.slice(0, sel.col + 1).flat() : r.cells[sel.col];
    return [...items].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [sel, rows, mode]);

  const btn = (on: boolean) =>
    `px-3 py-1.5 text-xs font-medium transition-colors ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Signal Heat Map</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Number of HA Pulse signals per month by topic, product or manufacturer — darker means more activity
          </p>
        </div>
        {data && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 max-w-xs text-right">
            {fmtLong(months[0])} – {fmtLong(months[last])} · latest signal {data.latestSignal}
          </div>
        )}
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {isError && <div className="text-sm text-destructive">Heat map data could not be loaded.</div>}

      {data && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Rows">
              {VIEWS.map(v => (
                <button key={v.id} className={btn(view === v.id)} onClick={() => { setView(v.id); setSel(null); }} data-testid={`heat-view-${v.id}`}>
                  {v.label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Mode">
              <button className={btn(mode === "month")} onClick={() => setMode("month")} data-testid="heat-mode-month">Monthly</button>
              <button className={btn(mode === "cum")} onClick={() => setMode("cum")} data-testid="heat-mode-cum">Cumulative</button>
            </div>
            <button
              onClick={play}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted/60"
              data-testid="heat-play"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range" min={0} max={last} value={cur}
              onChange={e => { setPlaying(false); setUpto(+e.target.value); }}
              className="flex-1 min-w-[140px] accent-[hsl(var(--primary))]"
              aria-label="Show months up to"
              data-testid="heat-slider"
            />
            <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">to {fmtMonth(months[cur])}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-separate" style={{ borderSpacing: 4 }}>
              <thead>
                <tr>
                  <th className="w-44" />
                  {months.map((m, i) => (
                    <th key={m} className={`text-[11px] font-medium tabular-nums ${i <= cur ? "text-muted-foreground" : "text-muted-foreground/30"}`}>
                      {fmtMonth(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={r.name}>
                    <td className="text-sm text-foreground text-right pr-3 whitespace-nowrap">{r.name}</td>
                    {months.map((m, i) => {
                      const v = value(r, i);
                      const show = i <= cur;
                      const t = Math.sqrt(v / max);
                      const isSel = sel?.row === ri && sel?.col === i;
                      return (
                        <td key={m} className="p-0">
                          <button
                            disabled={!show}
                            onClick={() => setSel({ row: ri, col: i })}
                            className={`w-full h-8 min-w-[38px] rounded-md text-xs tabular-nums transition-colors border ${isSel ? "border-foreground" : "border-border/50"}`}
                            style={{
                              background: show ? (v ? mix(lo, hi, t) : "transparent") : "transparent",
                              color: t > 0.6 ? "#fff" : undefined,
                              cursor: show ? "pointer" : "default",
                            }}
                            title={show ? `${r.name}, ${fmtLong(m)}: ${v}` : undefined}
                            data-testid={`heat-cell-${ri}-${i}`}
                          >
                            {show && v > 0 ? v : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="text-xs text-muted-foreground text-right pr-3">All signals</td>
                  {months.map((m, i) => (
                    <td key={m} className={`text-center text-xs tabular-nums ${i <= cur ? "text-muted-foreground" : "text-muted-foreground/30"}`}>
                      {mode === "cum" ? data.totals.slice(0, i + 1).reduce((a, b) => a + b, 0) : data.totals[i]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-t border-border pt-3 min-h-[90px]">
            {!sel || !rows[sel.row] ? (
              <p className="text-sm text-muted-foreground">Click a cell to see the signals behind it.</p>
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">
                  {rows[sel.row].name} · {mode === "cum" ? `through ${fmtLong(months[sel.col])}` : fmtLong(months[sel.col])} · {selItems.length} signal{selItems.length === 1 ? "" : "s"}
                </div>
                <ul className="space-y-1 max-h-64 overflow-y-auto pr-2">
                  {selItems.map((it, k) => (
                    <li key={k} className="text-sm">
                      <span className="text-muted-foreground tabular-nums mr-2">{it.date}</span>
                      <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-primary hover:underline">{it.title}</a>
                      <span className="text-muted-foreground"> — {it.source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        Topics are assigned by keyword matching on each signal's headline, summary and tags; products on the headline only. One signal can count in more than one row.
        The current month is partial. Updated with each weekday HA Pulse refresh.
      </p>
    </div>
  );
}
