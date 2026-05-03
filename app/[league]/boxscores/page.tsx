"use client";
import React from "react";
import Link from "next/link";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; logo_url?: string | null };
type Game = {
  id: string; league: string; scheduled_at: string; status: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};

export default function BoxScoresPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [games, setGames]                   = React.useState<Game[]>([]);
  const [loading, setLoading]               = React.useState(true);
  const [regularSeasons, setRegularSeasons] = React.useState<string[]>([]);
  const [playoffSeasons, setPlayoffSeasons] = React.useState<string[]>([]);
  const [season, setSeason]                 = React.useState<string>("");
  const [tab, setTab]                       = React.useState<"regular" | "playoffs">("regular");

  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/stats/seasons?league=${slug}`)
      .then(r => r.json())
      .then((data: { season: string }[]) => {
        if (!Array.isArray(data)) return;
        const all = data.map(d => d.season).filter(Boolean);
        const reg = [...new Set(all.filter(s => !s.toLowerCase().includes("playoff")))].sort((a, b) => b.localeCompare(a));
        const po  = [...new Set(all.filter(s =>  s.toLowerCase().includes("playoff")))].sort((a, b) => b.localeCompare(a));
        setRegularSeasons(reg);
        setPlayoffSeasons(po);
        if (reg.length > 0) setSeason(reg[0]);
      }).catch(() => {});
  }, [slug]);

  React.useEffect(() => {
    if (tab === "regular" && regularSeasons.length > 0) setSeason(regularSeasons[0]);
    if (tab === "playoffs" && playoffSeasons.length > 0) setSeason(playoffSeasons[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  React.useEffect(() => {
    if (!slug || !season) return;
    setLoading(true);
    fetch(`/api/games?league=${slug}&season=${encodeURIComponent(season)}`)
      .then(r => r.json())
      .then(data => {
        const completed = Array.isArray(data)
          ? data.filter((g: Game) => g.home_score !== null && g.away_score !== null)
          : [];
        setGames(completed.reverse());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug, season]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Box Scores</h2>
          <p className="text-slate-500 text-sm mt-0.5">{leagueDisplay}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Regular / Playoffs toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {(["regular", "playoffs"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-xs font-bold transition ${tab === t ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
                style={{ borderRight: t === "regular" ? "1px solid #334155" : "none" }}>
                {t === "regular" ? "Regular Season" : "🏆 Playoffs"}
              </button>
            ))}
          </div>
          {/* Season dropdown */}
          {(tab === "regular" ? regularSeasons : playoffSeasons).length > 0 && (
            <select value={season} onChange={e => setSeason(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 text-white text-sm px-3 py-1.5 focus:outline-none cursor-pointer">
              {(tab === "regular" ? regularSeasons : playoffSeasons).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Games list */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">Loading…</div>
      ) : games.length === 0 ? (
        <div className="p-12 text-center text-slate-500">
          {tab === "playoffs" ? "No playoff box scores yet." : "No completed games yet."}
        </div>
      ) : (
        <div className="p-4 flex flex-col gap-2">
          {games.map(g => {
            const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
            const awayWon = (g.away_score ?? 0) > (g.home_score ?? 0);
            return (
              <Link
                key={g.id}
                href={`/${slug}/boxscores/${g.id}`}
                className="block rounded-xl border border-slate-700 bg-slate-950 hover:border-slate-500 hover:bg-slate-800/40 transition"
              >
                <div className="grid items-center px-4 py-3.5 gap-3" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
                  {/* Home team */}
                  <div className="flex items-center gap-2.5 justify-end">
                    <div className="text-right">
                      <div className={`font-bold text-sm leading-tight ${homeWon ? "text-white" : "text-slate-500"}`}>{g.home_team?.name}</div>
                      <div className="text-[10px] text-slate-600 uppercase">{g.home_team?.abbreviation} · HOME</div>
                    </div>
                    {g.home_team?.logo_url
                      ? <img src={g.home_team.logo_url} className={`w-9 h-9 object-contain flex-shrink-0 ${homeWon ? "" : "opacity-40"}`} alt="" />
                      : <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-600 text-[10px] font-bold flex-shrink-0">{g.home_team?.abbreviation}</div>}
                  </div>

                  {/* Score */}
                  <div className="text-center min-w-[90px]">
                    <div className="flex items-center justify-center gap-2">
                      <span className={`text-2xl font-black tabular-nums leading-none ${homeWon ? "text-white" : "text-slate-600"}`}>{g.home_score}</span>
                      <span className="text-slate-700 text-sm">–</span>
                      <span className={`text-2xl font-black tabular-nums leading-none ${awayWon ? "text-white" : "text-slate-600"}`}>{g.away_score}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-green-400 bg-green-950 border border-green-800 rounded-full px-2 py-0.5">FINAL</span>
                      <span className="text-[10px] text-slate-600">
                        {new Date(g.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Etc/GMT+5" })}
                      </span>
                    </div>
                  </div>

                  {/* Away team */}
                  <div className="flex items-center gap-2.5 justify-start">
                    {g.away_team?.logo_url
                      ? <img src={g.away_team.logo_url} className={`w-9 h-9 object-contain flex-shrink-0 ${awayWon ? "" : "opacity-40"}`} alt="" />
                      : <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-600 text-[10px] font-bold flex-shrink-0">{g.away_team?.abbreviation}</div>}
                    <div>
                      <div className={`font-bold text-sm leading-tight ${awayWon ? "text-white" : "text-slate-500"}`}>{g.away_team?.name}</div>
                      <div className="text-[10px] text-slate-600 uppercase">{g.away_team?.abbreviation} · AWAY</div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
