"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

const SEASONS = ["Season 1","Season 1 Playoffs","Season 2","Season 2 Playoffs","Season 3","Season 3 Playoffs","Season 4","Season 4 Playoffs","Season 5","Season 5 Playoffs","Season 6","Season 6 Playoffs","Season 7","Season 7 Playoffs"];

type StatRow = {
  mc_uuid: string; mc_username: string; rank: number; gp: number;
  ppg: string; rpg: string; apg: string; spg: string; bpg: string; fg_pct: string;
};

export default function StatsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [stats, setStats] = React.useState<StatRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [season, setSeason] = React.useState("Season 7");

  React.useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/stats?league=${slug}&season=${encodeURIComponent(season)}`)
      .then((r) => r.json())
      .then((data) => { setStats(Array.isArray(data) ? data : []); setLoading(false); });
  }, [slug, season]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Stats</h2>
          <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
        </div>
        <select
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-zinc-500 focus:outline-none"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
        >
          {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading stats...</div>
      ) : stats.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No stats for {season} yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["#","Player","GP","PPG","RPG","APG","SPG","BPG","FG%"].map((h) => (
                  <th key={h} className={`px-3 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500 ${h === "Player" ? "text-left" : "text-center"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {stats.map((s) => (
                <tr key={s.mc_uuid} className="hover:bg-slate-800/40 transition">
                  <td className="px-3 py-3 text-center text-slate-500 text-xs font-mono">{s.rank}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <img src={`https://minotar.net/avatar/${s.mc_username}/28`} alt={s.mc_username} className="w-7 h-7 rounded ring-1 ring-slate-700" onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/28"; }} />
                      <span className="font-semibold text-white">{s.mc_username}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-slate-400">{s.gp}</td>
                  <td className="px-3 py-3 text-center font-bold text-white">{s.ppg}</td>
                  <td className="px-3 py-3 text-center text-slate-300">{s.rpg}</td>
                  <td className="px-3 py-3 text-center text-slate-300">{s.apg}</td>
                  <td className="px-3 py-3 text-center text-slate-300">{s.spg}</td>
                  <td className="px-3 py-3 text-center text-slate-300">{s.bpg}</td>
                  <td className="px-3 py-3 text-center text-slate-300">{s.fg_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}