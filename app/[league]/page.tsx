"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Minecraft Basketball Association", mba: "Minecraft Basketball Association",
  pcaa: "College", mcaa: "College",
  pbgl: "G League", mbgl: "G League",
};
const leagueLabel: Record<string, string> = {
  pba: "MBA", mba: "MBA", pcaa: "MCAA", mcaa: "MCAA", pbgl: "MBGL", mbgl: "MBGL",
};
const leagueColor: Record<string, string> = {
  pba: "#C8102E", mba: "#C8102E", pcaa: "#003087", mcaa: "#003087", pbgl: "#BB3430", mbgl: "#BB3430",
};

type Article = { id: string; league: string; title: string; body: string; created_at: string; image_url?: string | null };
type Team = { id: string; name: string; abbreviation: string; logo_url: string | null };
type Game = {
  id: string; scheduled_at: string; status: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};
type StatRow = {
  mc_uuid: string; mc_username: string; rank: number; gp: number;
  ppg: number | null; rpg: number | null; apg: number | null;
  spg: number | null; fg_pct: number | null; three_pt_pct: number | null;
};

const LEADER_CATS: { key: keyof StatRow; label: string; fmt: (v: number) => string; color: string; minGames?: number }[] = [
  { key: "ppg",        label: "PPG",  fmt: (v) => v.toFixed(1), color: "#f97316" },
  { key: "rpg",        label: "RPG",  fmt: (v) => v.toFixed(1), color: "#22d3ee" },
  { key: "apg",        label: "APG",  fmt: (v) => v.toFixed(1), color: "#a78bfa" },
  { key: "spg",        label: "SPG",  fmt: (v) => v.toFixed(1), color: "#4ade80" },
  { key: "fg_pct",     label: "FG%",  fmt: (v) => `${v.toFixed(1)}%`, color: "#facc15" },
  { key: "three_pt_pct", label: "3FG%", fmt: (v) => `${v.toFixed(1)}%`, color: "#fb7185", minGames: 4 },
];

function LeaderCard({ cat, stats }: { cat: typeof LEADER_CATS[number]; stats: StatRow[] }) {
  const top5 = [...stats]
    .filter((s) => (s[cat.key] as number | null) != null && s.gp >= (cat.minGames ?? 1))
    .sort((a, b) => ((b[cat.key] as number) ?? 0) - ((a[cat.key] as number) ?? 0))
    .slice(0, 5);

  if (top5.length === 0) return null;
  const leader = top5[0];

  return (
    <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden" }}>
      {/* Category header */}
      <div style={{ background: "#0d0d0d", borderBottom: "1px solid #1e1e1e", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: cat.color, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {cat.label} Leaders{cat.minGames ? <span style={{ color: "#444", fontSize: 10, fontWeight: 600, textTransform: "none", letterSpacing: 0, marginLeft: 5 }}>min. {cat.minGames} GP</span> : null}
        </span>
        <span style={{ color: cat.color, fontSize: 13, fontWeight: 800 }}>{cat.fmt((leader[cat.key] as number))}</span>
      </div>
      {/* Leader spotlight */}
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #1a1a1a" }}>
        <img
          src={`https://minotar.net/avatar/${leader.mc_username}/40`}
          alt={leader.mc_username}
          style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${cat.color}55`, flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/40"; }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leader.mc_username}</div>
          <div style={{ color: "#555", fontSize: 10 }}>League Leader</div>
        </div>
        <div style={{ color: cat.color, fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{cat.fmt((leader[cat.key] as number))}</div>
      </div>
      {/* Rows 2–5 */}
      {top5.slice(1).map((s, i) => (
        <div key={s.mc_uuid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: i < top5.length - 2 ? "1px solid #141414" : undefined }}>
          <span style={{ color: "#333", fontSize: 11, fontWeight: 700, width: 14, textAlign: "right", flexShrink: 0 }}>{i + 2}</span>
          <img
            src={`https://minotar.net/avatar/${s.mc_username}/24`}
            alt={s.mc_username}
            style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
          />
          <span style={{ color: "#aaa", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.mc_username}</span>
          <span style={{ color: "#ddd", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{cat.fmt((s[cat.key] as number))}</span>
        </div>
      ))}
    </div>
  );
}

export default function LeagueHome({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();
  const label = leagueLabel[slug] ?? slug.toUpperCase();
  const color = leagueColor[slug] ?? "#888";

  const [articles, setArticles] = React.useState<Article[]>([]);
  const [recentGames, setRecentGames] = React.useState<Game[]>([]);
  const [leaders, setLeaders] = React.useState<StatRow[]>([]);
  const [leaderSeason, setLeaderSeason] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!slug) { setLoading(false); return; }

    fetch("/api/articles")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const dbSlug = slug === "mba" ? "pba" : slug === "mcaa" ? "pcaa" : slug === "mbgl" ? "pbgl" : slug;
          setArticles(data.filter((a: Article) => a.league === slug || a.league === dbSlug));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch(`/api/games?league=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const completed = data.filter((g: Game) => (g.status === "final" || g.status === "completed") && g.home_score !== null);
          setRecentGames(completed.slice(-3).reverse());
        }
      })
      .catch(() => {});

    // Fetch most recent season that actually has stats (playoffs count as more recent than base season)
    (async () => {
      try {
        const r = await fetch(`/api/stats/seasons?league=${slug}`);
        const data: { season: string; gp?: number | null }[] = await r.json();
        if (!Array.isArray(data)) return;
        const seasonKey = (s: string) => {
          const m = s.match(/Season\s+(\d+)/i);
          const num = m ? parseInt(m[1]) : 0;
          return num + (s.toLowerCase().includes("playoff") ? 0.5 : 0);
        };
        const all = [...new Set(data.map((d) => d.season).filter(Boolean))]
          .sort((a, b) => seasonKey(b) - seasonKey(a));
        for (const s of all) {
          const sr = await fetch(`/api/stats?league=${slug}&season=${encodeURIComponent(s)}`);
          const sd = await sr.json();
          if (Array.isArray(sd) && sd.length > 0) {
            setLeaderSeason(s);
            setLeaders(sd);
            break;
          }
        }
      } catch { /**/ }
    })();
  }, [slug]);

  return (
    <main className="min-h-screen" style={{ background: "#08090e" }}>
      <div className="mx-auto px-4 sm:px-6 py-10" style={{ maxWidth: 1280 }}>
        {/* Hero */}
        <div className="rounded-2xl overflow-hidden mb-8" style={{ background: "linear-gradient(135deg, #111 0%, #1a1a1a 100%)", border: "1px solid #1e1e1e" }}>
          <div className="px-8 py-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🏀</span>
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color }}>{leagueDisplay}</span>
            </div>
            <h1 className="text-4xl font-black text-white leading-tight mb-1">Latest News</h1>
            <p className="text-sm" style={{ color: "#555" }}>Updates, announcements, and highlights from the {label}</p>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>

          {/* LEFT — recent results + articles */}
          <div style={{ minWidth: 0 }}>
            {recentGames.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <h2 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#555" }}>Recent Results</h2>
                <div className="flex flex-col gap-2">
                  {recentGames.map((g) => (
                    <a key={g.id} href={`/${slug}/boxscores?game=${g.id}`}
                      className="rounded-xl px-5 py-3 flex items-center justify-between gap-4 transition-colors"
                      style={{ background: "#111", border: "1px solid #1e1e1e", textDecoration: "none", display: "flex", cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#333")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e1e1e")}
                    >
                      <div className="flex items-center gap-3 flex-1 justify-end">
                        {g.home_team?.logo_url && <img src={g.home_team.logo_url} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} />}
                        <span className="font-semibold text-white text-sm">{g.home_team?.abbreviation}</span>
                      </div>
                      <div className="text-center flex-shrink-0">
                        <div className="text-lg font-black text-white tabular-nums">{g.home_score} – {g.away_score}</div>
                        <div className="text-xs font-semibold" style={{ color: "#4ade80" }}>Final</div>
                      </div>
                      <div className="flex items-center gap-3 flex-1 justify-start">
                        <span className="font-semibold text-white text-sm">{g.away_team?.abbreviation}</span>
                        {g.away_team?.logo_url && <img src={g.away_team.logo_url} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} />}
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: "#444" }}>
                        {new Date(g.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#555" }}>News</h2>
              {loading ? (
                <div className="py-20 text-center" style={{ color: "#444" }}>Loading...</div>
              ) : articles.length === 0 ? (
                <div className="py-20 text-center rounded-2xl" style={{ background: "#111", border: "1px solid #1e1e1e", color: "#444" }}>
                  No articles yet for the {label}.
                </div>
              ) : (
                <div className="space-y-4">
                  {articles.map((a) => (
                    <article key={a.id} className="rounded-2xl p-6 transition-all duration-150 hover:scale-[1.005]" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className="text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-md" style={{ background: leagueColor[a.league] ?? "#333", color: "white" }}>
                          {leagueLabel[a.league] ?? a.league.toUpperCase()}
                        </span>
                        <span className="text-xs" style={{ color: "#444" }}>
                          {new Date(a.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                      {a.image_url && <img src={a.image_url} alt="" className="rounded-xl mb-3 max-h-64 object-cover w-full" />}
                      <h2 className="text-xl font-bold text-white mb-2 leading-snug">{a.title}</h2>
                      <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#888" }}>{a.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — stat leaders */}
          <div style={{ position: "sticky", top: 80 }}>
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: "#555" }}>Leaders</h2>
              {leaderSeason && <span style={{ color: "#333", fontSize: 11, fontWeight: 600 }}>{leaderSeason}</span>}
            </div>
            {leaders.length === 0 ? (
              <div style={{ color: "#333", fontSize: 12, textAlign: "center", padding: "24px 0" }}>No stats yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {LEADER_CATS.map((cat) => (
                  <LeaderCard key={cat.key as string} cat={cat} stats={leaders} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
