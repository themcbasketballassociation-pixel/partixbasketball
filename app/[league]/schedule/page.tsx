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
                        {g.status === "completed" ? (
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
                        g.status === "completed" ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"
                      }`}>
                        {g.status === "completed" ? "Final" : "Scheduled"}
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

function BracketMatchupCard({ matchup }: { matchup: BracketMatchup }) {
  const hasScores = matchup.team1_score != null || matchup.team2_score != null;
  const t1Won = matchup.winner?.id === matchup.team1?.id;
  const t2Won = matchup.winner?.id === matchup.team2?.id;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden min-w-[200px]">
      {/* Team 1 */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b border-slate-800 ${t1Won ? "bg-green-950/40" : ""}`}>
        <div className="flex items-center gap-2">
          {matchup.team1?.logo_url ? (
            <img src={matchup.team1.logo_url} className="w-5 h-5 rounded object-contain" alt="" />
          ) : (
            <div className="w-5 h-5 rounded bg-slate-700 flex items-center justify-center text-[9px] text-slate-400 font-bold">
              {matchup.team1?.abbreviation?.[0] ?? "?"}
            </div>
          )}
          <span className={`text-sm font-semibold ${t1Won ? "text-green-300" : matchup.team1 ? "text-white" : "text-slate-600"}`}>
            {matchup.team1?.abbreviation ?? "TBD"}
          </span>
          {t1Won && <span className="text-yellow-400 text-xs">🏆</span>}
        </div>
        <span className={`tabular-nums text-sm font-bold ${t1Won ? "text-green-300" : "text-slate-300"}`}>
          {hasScores ? (matchup.team1_score ?? "—") : ""}
        </span>
      </div>
      {/* Team 2 */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${t2Won ? "bg-green-950/40" : ""}`}>
        <div className="flex items-center gap-2">
          {matchup.team2?.logo_url ? (
            <img src={matchup.team2.logo_url} className="w-5 h-5 rounded object-contain" alt="" />
          ) : (
            <div className="w-5 h-5 rounded bg-slate-700 flex items-center justify-center text-[9px] text-slate-400 font-bold">
              {matchup.team2?.abbreviation?.[0] ?? "?"}
            </div>
          )}
          <span className={`text-sm font-semibold ${t2Won ? "text-green-300" : matchup.team2 ? "text-white" : "text-slate-600"}`}>
            {matchup.team2?.abbreviation ?? "TBD"}
          </span>
          {t2Won && <span className="text-yellow-400 text-xs">🏆</span>}
        </div>
        <span className={`tabular-nums text-sm font-bold ${t2Won ? "text-green-300" : "text-slate-300"}`}>
          {hasScores ? (matchup.team2_score ?? "—") : ""}
        </span>
      </div>
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

  // Group matchups by round_name (ordered by round_order)
  const rounds: { name: string; matchups: BracketMatchup[] }[] = [];
  const seen = new Set<string>();
  for (const m of matchups) {
    if (!seen.has(m.round_name)) {
      seen.add(m.round_name);
      rounds.push({ name: m.round_name, matchups: [] });
    }
    rounds.find((r) => r.name === m.round_name)!.matchups.push(m);
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <label className="text-slate-400 text-sm font-medium">Season:</label>
        <select
          className="rounded-lg border border-slate-700 bg-slate-800 text-white text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
        >
          {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading bracket...</div>
      ) : matchups.length === 0 ? (
        <div className="text-center text-slate-500 py-10">No bracket set up for {season} yet.</div>
      ) : (
        <div className="flex gap-8 overflow-x-auto pb-4">
          {rounds.map((round) => (
            <div key={round.name} className="flex flex-col gap-4 flex-shrink-0">
              <div className="text-center mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-800 rounded-full px-3 py-1">
                  {round.name}
                </span>
              </div>
              {/* Vertically center matchups within the round */}
              <div className="flex flex-col gap-6 justify-center flex-1">
                {round.matchups.map((m) => (
                  <BracketMatchupCard key={m.id} matchup={m} />
                ))}
              </div>
            </div>
          ))}
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
