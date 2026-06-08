"use client";

import Link from "next/link";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; logo_url?: string | null };
type Game = {
  id: string;
  league: string;
  scheduled_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team: Team | null;
  away_team: Team | null;
};

function getWeekKey(scheduledAt: string): string {
  const etDateStr = new Date(scheduledAt).toLocaleDateString("en-CA", { timeZone: "Etc/GMT+5" });
  const d = new Date(`${etDateStr}T12:00:00`);
  const dow = d.getDay();
  const daysToThursday = dow >= 4 ? dow - 4 : dow + 3;
  const thu = new Date(d);
  thu.setDate(d.getDate() - daysToThursday);
  return thu.toISOString().slice(0, 10);
}

function TeamMark({ team, won }: { team: Team | null; won: boolean }) {
  if (team?.logo_url) {
    return <img src={team.logo_url} className={`h-10 w-10 shrink-0 object-contain ${won ? "" : "opacity-35"}`} alt="" />;
  }
  return (
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-900 text-[10px] font-black ${won ? "text-slate-200" : "text-slate-600"}`}>
      {team?.abbreviation ?? "TBD"}
    </div>
  );
}

function TeamSide({ team, score, won, align }: { team: Team | null; score: number | null; won: boolean; align: "left" | "right" }) {
  const reverse = align === "right";
  return (
    <div className={`flex min-w-0 items-center gap-3 ${reverse ? "justify-end text-right" : "justify-start text-left"}`}>
      {reverse && (
        <div className="min-w-0">
          <div className={`truncate text-base font-black ${won ? "text-white" : "text-slate-500"}`}>{team?.name ?? "Unknown"}</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">{team?.abbreviation ?? "-"}</div>
        </div>
      )}
      <TeamMark team={team} won={won} />
      {!reverse && (
        <div className="min-w-0">
          <div className={`truncate text-base font-black ${won ? "text-white" : "text-slate-500"}`}>{team?.name ?? "Unknown"}</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">{team?.abbreviation ?? "-"}</div>
        </div>
      )}
      <div className={`shrink-0 text-3xl font-black tabular-nums ${won ? "text-white" : "text-slate-600"}`}>{score ?? "-"}</div>
    </div>
  );
}

export default function BoxScoresPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [regularSeasons, setRegularSeasons] = React.useState<string[]>([]);
  const [playoffSeasons, setPlayoffSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState("");
  const [tab, setTab] = React.useState<"regular" | "playoffs">("regular");

  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/stats/seasons?league=${slug}`)
      .then((r) => r.json())
      .then((data: { season: string }[]) => {
        if (!Array.isArray(data)) return;
        const all = data.map((d) => d.season).filter(Boolean);
        const reg = [...new Set(all.filter((s) => !s.toLowerCase().includes("playoff")))].sort((a, b) => b.localeCompare(a));
        const po = [...new Set(all.filter((s) => s.toLowerCase().includes("playoff")))].sort((a, b) => b.localeCompare(a));
        setRegularSeasons(reg);
        setPlayoffSeasons(po);
        if (reg.length > 0) setSeason(reg[0]);
      }).catch(() => {});
  }, [slug]);

  React.useEffect(() => {
    if (tab === "regular" && regularSeasons.length > 0) setSeason(regularSeasons[0]);
    if (tab === "playoffs" && playoffSeasons.length > 0) setSeason(playoffSeasons[0]);
  }, [tab, regularSeasons, playoffSeasons]);

  React.useEffect(() => {
    if (!slug || !season) return;
    setLoading(true);
    fetch(`/api/games?league=${slug}&season=${encodeURIComponent(season)}`)
      .then((r) => r.json())
      .then((data) => {
        const completed = Array.isArray(data)
          ? data.filter((g: Game) => g.home_score !== null && g.away_score !== null)
          : [];
        setGames([...completed].reverse());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug, season]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of games) {
      const key = getWeekKey(g.scheduled_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    const keys = [...map.keys()].sort();
    const weekNumMap = new Map(keys.map((k, i) => [k, i + 1]));
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, value]) => ({ key, games: value, week: weekNumMap.get(key) ?? 0 }));
  }, [games]);

  const visibleSeasons = tab === "regular" ? regularSeasons : playoffSeasons;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0b0f16] shadow-xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 bg-gradient-to-br from-slate-950 via-slate-950 to-red-950/30 px-6 py-6">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-red-400">{leagueDisplay}</div>
          <h1 className="mt-1 text-4xl font-black tracking-tight text-white">Box Scores</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Completed games, final scores, and full box score links.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-xs">
            {(["regular", "playoffs"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-2 font-black transition ${tab === t ? "bg-red-600 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}
              >
                {t === "regular" ? "Regular" : "Playoffs"}
              </button>
            ))}
          </div>
          {visibleSeasons.length > 0 && (
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none"
            >
              {visibleSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">Loading...</div>
      ) : games.length === 0 ? (
        <div className="p-12 text-center text-slate-500">{tab === "playoffs" ? "No playoff box scores yet." : "No completed games yet."}</div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {grouped.map(({ key, games: weekGames, week }) => (
            <section key={key} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/70 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-widest text-white">Week {week}</div>
                <div className="text-[11px] font-bold text-slate-500">
                  {new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "Etc/GMT+5" })} week
                </div>
              </div>
              <div className="grid gap-2 p-2">
                {weekGames.map((g) => {
                  const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
                  const awayWon = (g.away_score ?? 0) > (g.home_score ?? 0);
                  return (
                    <Link
                      key={g.id}
                      href={`/${slug}/boxscores/${g.id}`}
                      className="block rounded-xl border border-slate-800 bg-[#080b11] p-4 transition hover:border-slate-600 hover:bg-slate-900/70"
                    >
                      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
                        <TeamSide team={g.home_team} score={g.home_score} won={homeWon} align="right" />
                        <div className="text-center">
                          <div className="text-xs font-black uppercase tracking-widest text-slate-500">Final</div>
                          <div className="mt-1 text-[11px] font-bold text-slate-600">
                            {new Date(g.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Etc/GMT+5" })}
                          </div>
                        </div>
                        <TeamSide team={g.away_team} score={g.away_score} won={awayWon} align="left" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
