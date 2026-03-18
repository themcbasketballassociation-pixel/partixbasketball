"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Partix Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

const SEASONS = [
  "Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7",
];

type Team = { id: string; name: string; abbreviation: string; logo_url?: string | null };
type Game = {
  id: string; league: string; scheduled_at: string; status: string;
  home_team_id: string; away_team_id: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};
type BracketMatchup = {
  id: string; round_name: string; round_order: number; matchup_index: number;
  team1: Team | null; team2: Team | null;
  team1_score: number | null; team2_score: number | null;
  winner: Team | null;
};

function getWeekKey(scheduledAt: string): string {
  const d = new Date(scheduledAt);
  const dow = d.getDay();
  const daysToThursday = dow >= 4 ? dow - 4 : dow + 3;
  const thu = new Date(d);
  thu.setDate(d.getDate() - daysToThursday);
  return thu.toISOString().slice(0, 10);
}

function ScheduleView({ slug }: { slug: string }) {
  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/games?league=${slug}`)
      .then((r) => r.json())
      .then((data) => { setGames(Array.isArray(data) ? data : []); setLoading(false); });
  }, [slug]);

  const grouped = games.reduce<Record<string, Game[]>>((acc, g) => {
    const key = getWeekKey(g.scheduled_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});
  const weekKeys = Object.keys(grouped).sort();

  if (loading) return <div className="p-10 text-center text-slate-500">Loading schedule...</div>;
  if (games.length === 0) return <div className="p-10 text-center text-slate-500">No games scheduled yet.</div>;

  return (
    <div className="p-6 space-y-8">
      {weekKeys.map((weekKey, wi) => {
        const weekGames = grouped[weekKey].sort(
          (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        );
        const byDay = weekGames.reduce<Record<string, Game[]>>((acc, g) => {
          const dayLabel = new Date(g.scheduled_at).toLocaleDateString(undefined, { weekday: "long" });
          if (!acc[dayLabel]) acc[dayLabel] = [];
          acc[dayLabel].push(g);
          return acc;
        }, {});
        const days = Object.keys(byDay);

        return (
          <div key={weekKey} className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
              <span className="font-bold text-white text-sm tracking-wide">WEEK {wi + 1}</span>
              <span className="text-slate-500 text-xs">
                {new Date(weekKey).toLocaleDateString(undefined, { month: "long", day: "numeric" })} week
              </span>
            </div>
            {days.map((day) => (
              <div key={day}>
                <div className="px-5 py-2 bg-slate-900/50 border-b border-slate-800">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{day}</span>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {byDay[day].map((g) => (
                    <div key={g.id} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-900/40 transition">
                      <span className="text-slate-500 text-sm w-20 flex-shrink-0">
                        {new Date(g.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} EST
                      </span>
                      <div className="flex items-center gap-3 flex-1">
                        <div className="text-right min-w-[100px]">
                          <div className="font-semibold text-white">{g.home_team?.name ?? "?"}</div>
                          <div className="text-xs text-slate-500">{g.home_team?.abbreviation}</div>
                        </div>
                        {g.home_score !== null && g.away_score !== null ? (
                          <div className="text-center px-3">
                            <div className="text-lg font-bold text-white tabular-nums">{g.home_score} – {g.away_score}</div>
                            <div className="text-xs text-green-400 font-semibold">Final</div>
                          </div>
                        ) : (
                          <div className="text-slate-600 font-medium px-3">vs</div>
                        )}
                        <div className="text-left min-w-[100px]">
                          <div className="font-semibold text-white">{g.away_team?.name ?? "?"}</div>
                          <div className="text-xs text-slate-500">{g.away_team?.abbreviation}</div>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold flex-shrink-0 ${
                        g.home_score !== null && g.away_score !== null ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"
                      }`}>
                        {g.home_score !== null && g.away_score !== null ? "Final" : "Scheduled"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BracketCard({ matchup }: { matchup: BracketMatchup }) {
  const hasScores = matchup.team1_score != null || matchup.team2_score != null;
  const t1Won = !!matchup.winner && matchup.winner.id === matchup.team1?.id;
  const t2Won = !!matchup.winner && matchup.winner.id === matchup.team2?.id;

  const TeamRow = ({ team, score, won, border }: { team: Team | null; score: number | null; won: boolean; border?: boolean }) => (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 ${border ? "border-b border-slate-700/60" : ""} ${won ? "bg-blue-950/40" : ""}`}>
      <div className="flex items-center gap-2 min-w-0">
        {team?.logo_url ? (
          <img src={team.logo_url} className="w-5 h-5 rounded-sm object-contain flex-shrink-0" alt="" />
        ) : (
          <div className="w-5 h-5 rounded-sm bg-slate-700 flex items-center justify-center text-[9px] text-slate-400 font-bold flex-shrink-0">
            {team?.abbreviation?.[0] ?? "?"}
          </div>
        )}
        <span className={`text-xs font-bold truncate ${won ? "text-white" : team ? "text-slate-300" : "text-slate-600"}`}>
          {team?.abbreviation ?? "TBD"}
        </span>
        {won && <span className="text-yellow-400 text-[10px] flex-shrink-0">🏆</span>}
      </div>
      <span className={`tabular-nums text-sm font-black flex-shrink-0 ${won ? "text-white" : "text-slate-500"}`}>
        {hasScores ? (score ?? "—") : ""}
      </span>
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden w-[160px]">
      <TeamRow team={matchup.team1} score={matchup.team1_score} won={t1Won} border />
      <TeamRow team={matchup.team2} score={matchup.team2_score} won={t2Won} />
    </div>
  );
}

// Parse "East — Conf. Semifinals" → { conf: "East", display: "Conf. Semifinals" }
function parseRoundName(name: string): { conf: string | null; display: string } {
  const sep = " — ";
  const idx = name.indexOf(sep);
  if (idx !== -1) return { conf: name.slice(0, idx), display: name.slice(idx + sep.length) };
  return { conf: null, display: name };
}

function RoundColumn({ rounds, reversed }: {
  rounds: { name: string; matchups: BracketMatchup[] }[];
  reversed?: boolean;
}) {
  const cols = reversed ? [...rounds].reverse() : rounds;
  return (
    <div className="flex items-stretch">
      {cols.map((round, ri) => {
        const gapClass = round.matchups.length >= 8 ? "gap-1" : round.matchups.length >= 4 ? "gap-4" : round.matchups.length >= 2 ? "gap-12" : "gap-0";
        return (
          <div key={round.name} className="flex flex-col flex-shrink-0">
            <div className="text-center mb-2 px-2">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                {parseRoundName(round.name).display}
              </span>
            </div>
            <div className={`flex flex-col flex-1 items-center justify-around ${gapClass} px-2`}>
              {round.matchups.map((m) => (
                <BracketCard key={m.id} matchup={m} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BracketView({ slug }: { slug: string }) {
  const [season, setSeason] = React.useState(SEASONS[SEASONS.length - 1]);
  const [matchups, setMatchups] = React.useState<BracketMatchup[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!slug || !season) return;
    setLoading(true);
    fetch(`/api/playoff-brackets?league=${encodeURIComponent(slug)}&season=${encodeURIComponent(season)}`)
      .then((r) => r.json())
      .then((d) => { setMatchups(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug, season]);

  // Detect conferences
  const confSet = new Set<string>();
  const confMatchups: Record<string, BracketMatchup[]> = {};
  const nonConfMatchups: BracketMatchup[] = [];
  for (const m of matchups) {
    const { conf } = parseRoundName(m.round_name);
    if (conf) { confSet.add(conf); if (!confMatchups[conf]) confMatchups[conf] = []; confMatchups[conf].push(m); }
    else nonConfMatchups.push(m);
  }
  const confNames = [...confSet];
  const hasConferences = confNames.length > 0;

  // Build rounds for a set of matchups
  function buildRounds(ms: BracketMatchup[]) {
    const map = new Map<string, { order: number; matchups: BracketMatchup[] }>();
    for (const m of ms) {
      if (!map.has(m.round_name)) map.set(m.round_name, { order: m.round_order, matchups: [] });
      map.get(m.round_name)!.matchups.push(m);
    }
    return [...map.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name, { matchups: rms }]) => ({ name, matchups: [...rms].sort((a, b) => a.matchup_index - b.matchup_index) }));
  }

  const allRounds = buildRounds(matchups);
  const lastRound = allRounds[allRounds.length - 1];
  const champion = lastRound?.matchups[0]?.winner ?? null;

  const finalsRounds = buildRounds(nonConfMatchups);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <label className="text-slate-400 text-sm font-medium">Season:</label>
        <select
          className="rounded-lg border border-slate-700 bg-slate-800 text-white text-sm px-3 py-1.5 focus:outline-none"
          value={season} onChange={(e) => setSeason(e.target.value)}
        >
          {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading bracket...</div>
      ) : matchups.length === 0 ? (
        <div className="text-center text-slate-500 py-10">No bracket set up for {season} yet.</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          {/* Champion banner */}
          {champion && (
            <div className="flex justify-center mb-6">
              <div className="flex items-center gap-3 rounded-xl border border-yellow-600/40 bg-yellow-950/30 px-5 py-3">
                <span className="text-2xl">🏆</span>
                {champion.logo_url && <img src={champion.logo_url} className="w-8 h-8 object-contain rounded" alt="" />}
                <div>
                  <div className="text-xs text-yellow-400 font-semibold uppercase tracking-widest">Champion</div>
                  <div className="text-white font-bold">{champion.name}</div>
                </div>
              </div>
            </div>
          )}

          {hasConferences ? (
            /* NBA-style: Left conf → Finals ← Right conf */
            <div className="flex items-center justify-center gap-0">
              {confNames.map((confName, ci) => {
                const rounds = buildRounds(confMatchups[confName] ?? []);
                const isRight = ci === 1;
                return (
                  <React.Fragment key={confName}>
                    {isRight && finalsRounds.length > 0 && (
                      <div className="flex flex-col items-center flex-shrink-0 px-2">
                        <div className="text-center mb-2">
                          <span className="text-[9px] font-bold text-yellow-500 uppercase tracking-wider">Finals</span>
                        </div>
                        <div className="flex flex-col gap-4 items-center">
                          {finalsRounds.flatMap(r => r.matchups).map(m => (
                            <BracketCard key={m.id} matchup={m} />
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="text-center mb-2 px-3">
                        <span className={`text-xs font-bold uppercase tracking-widest ${ci === 0 ? "text-blue-400" : "text-orange-400"}`}>
                          {confName}
                        </span>
                      </div>
                      <RoundColumn rounds={rounds} reversed={isRight} />
                    </div>
                  </React.Fragment>
                );
              })}
              {/* If only 1 conference (edge case), still show Finals */}
              {confNames.length === 1 && finalsRounds.length > 0 && (
                <div className="flex flex-col items-center flex-shrink-0 px-2">
                  <div className="text-center mb-2">
                    <span className="text-[9px] font-bold text-yellow-500 uppercase tracking-wider">Finals</span>
                  </div>
                  {finalsRounds.flatMap(r => r.matchups).map(m => <BracketCard key={m.id} matchup={m} />)}
                </div>
              )}
            </div>
          ) : (
            /* Simple linear bracket */
            <div className="flex items-stretch gap-0">
              {allRounds.map((round) => {
                const gapClass = round.matchups.length >= 8 ? "gap-2" : round.matchups.length >= 4 ? "gap-6" : round.matchups.length >= 2 ? "gap-16" : "gap-0";
                return (
                  <div key={round.name} className="flex flex-col flex-shrink-0">
                    <div className="text-center mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap px-2">
                        {round.name}
                      </span>
                    </div>
                    <div className={`flex flex-col flex-1 items-center justify-around ${gapClass} px-3`}>
                      {round.matchups.map((m) => <BracketCard key={m.id} matchup={m} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SchedulePage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();
  const [activeTab, setActiveTab] = React.useState<"schedule" | "bracket">("schedule");

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800">
        <h2 className="text-2xl font-bold text-white">Schedule</h2>
        <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-800 px-6">
        {(["schedule", "bracket"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-3 text-sm font-medium capitalize transition-colors ${
              activeTab === t
                ? "border-b-2 border-blue-500 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t === "schedule" ? "Schedule" : "🏆 Bracket"}
          </button>
        ))}
      </div>

      {activeTab === "schedule" ? (
        <ScheduleView slug={slug} />
      ) : (
        <BracketView slug={slug} />
      )}
    </div>
  );
}
