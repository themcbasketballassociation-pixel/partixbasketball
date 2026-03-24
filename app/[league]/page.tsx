"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Minecraft Basketball Association",
  mba: "Minecraft Basketball Association",
  pcaa: "College",
  mcaa: "College",
  pbgl: "G League",
  mbgl: "G League",
};
const leagueLabel: Record<string, string> = {
  pba: "MBA", mba: "MBA",
  pcaa: "MCAA", mcaa: "MCAA",
  pbgl: "MBGL", mbgl: "MBGL",
};
const leagueColor: Record<string, string> = {
  pba: "#C8102E", mba: "#C8102E",
  pcaa: "#003087", mcaa: "#003087",
  pbgl: "#BB3430", mbgl: "#BB3430",
};

type Article = { id: string; league: string; title: string; body: string; created_at: string; image_url?: string | null };
type Team = { id: string; name: string; abbreviation: string; logo_url: string | null };
type Game = {
  id: string; scheduled_at: string; status: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};

export default function LeagueHome({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();
  const label = leagueLabel[slug] ?? slug.toUpperCase();
  const color = leagueColor[slug] ?? "#888";

  const [articles, setArticles] = React.useState<Article[]>([]);
  const [recentGames, setRecentGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!slug) { setLoading(false); return; }
    // Fetch all articles and filter to this league
    fetch("/api/articles")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Map new public slug → old DB slug for filtering
          const dbSlug = slug === "mba" ? "pba" : slug === "mcaa" ? "pcaa" : slug === "mbgl" ? "pbgl" : slug;
          setArticles(data.filter((a: Article) => a.league === slug || a.league === dbSlug));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Fetch recent completed games
    fetch(`/api/games?league=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const completed = data.filter((g: Game) => g.status === "completed" && g.home_score !== null);
          setRecentGames(completed.slice(-5).reverse());
        }
      })
      .catch(() => {});
  }, [slug]);

  return (
    <main className="min-h-screen" style={{ background: "#080808" }}>
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-8">
        {/* Hero */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #111 0%, #1a1a1a 100%)", border: "1px solid #1e1e1e" }}>
          <div className="px-8 py-10">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🏀</span>
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color }}>
                {leagueDisplay}
              </span>
            </div>
            <h1 className="text-4xl font-black text-white leading-tight mb-2">Latest News</h1>
            <p className="text-sm" style={{ color: "#555" }}>Updates, announcements, and highlights from the {label}</p>
          </div>
        </div>

        {/* Recent Results */}
        {recentGames.length > 0 && (
          <div>
            <h2 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#555" }}>Recent Results</h2>
            <div className="flex flex-col gap-2">
              {recentGames.map((g) => (
                <div key={g.id} className="rounded-xl px-5 py-3 flex items-center justify-between gap-4" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
                  <div className="flex items-center gap-3 flex-1 justify-end">
                    {g.home_team?.logo_url && (
                      <img src={g.home_team.logo_url} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} />
                    )}
                    <span className="font-semibold text-white text-sm">{g.home_team?.abbreviation}</span>
                  </div>
                  <div className="text-center flex-shrink-0">
                    <div className="text-lg font-black text-white tabular-nums">{g.home_score} – {g.away_score}</div>
                    <div className="text-xs font-semibold" style={{ color: "#4ade80" }}>Final</div>
                  </div>
                  <div className="flex items-center gap-3 flex-1 justify-start">
                    <span className="font-semibold text-white text-sm">{g.away_team?.abbreviation}</span>
                    {g.away_team?.logo_url && (
                      <img src={g.away_team.logo_url} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} />
                    )}
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: "#444" }}>
                    {new Date(g.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Articles */}
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
                <article
                  key={a.id}
                  className="rounded-2xl p-6 transition-all duration-150 hover:scale-[1.005]"
                  style={{ background: "#111", border: "1px solid #1e1e1e" }}
                >
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span
                      className="text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-md"
                      style={{ background: leagueColor[a.league] ?? "#333", color: "white" }}
                    >
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
      </section>
    </main>
  );
}
