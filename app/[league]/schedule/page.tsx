"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Minecraft Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string };
type Game = {
  id: string; league: string; scheduled_at: string; status: string;
  home_team_id: string; away_team_id: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};

function getWeekKey(scheduledAt: string): string {
  const d = new Date(scheduledAt);
  const dow = d.getDay();
  const daysToThursday = dow >= 4 ? dow - 4 : dow + 3;
  const thu = new Date(d);
  thu.setDate(d.getDate() - daysToThursday);
  return thu.toISOString().slice(0, 10);
}

export default function SchedulePage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!slug) { setLoading(false); return; }
    fetch(`/api/games?league=${slug}`)
      .then((r) => r.json())
      .then((data) => { setGames(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  const grouped = games.reduce<Record<string, Game[]>>((acc, g) => {
    const key = getWeekKey(g.scheduled_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});
  const weekKeys = Object.keys(grouped).sort();

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800">
        <h2 className="text-2xl font-bold text-white">Schedule</h2>
        <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
      </div>
      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading schedule...</div>
      ) : games.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No games scheduled yet.</div>
      ) : (
        <div className="p-6 space-y-8">
          {weekKeys.map((weekKey, wi) => {
            const weekGames = grouped[weekKey].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
            const byDay = weekGames.reduce<Record<string, Game[]>>((acc, g) => {
              const dayLabel = new Date(g.scheduled_at).toLocaleDateString(undefined, { weekday: "long" });
              if (!acc[dayLabel]) acc[dayLabel] = [];
              acc[dayLabel].push(g);
              return acc;
            }, {});
            return (
              <div key={weekKey} className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
                  <span className="font-bold text-white text-sm tracking-wide">WEEK {wi + 1}</span>
                  <span className="text-slate-500 text-xs">{new Date(weekKey).toLocaleDateString(undefined, { month: "long", day: "numeric" })} week</span>
                </div>
                {Object.keys(byDay).map((day) => (
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
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold flex-shrink-0 ${g.status === "completed" ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>
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
      )}
    </div>
  );
}