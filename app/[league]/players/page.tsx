"use client";
import React from "react";
import Link from "next/link";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Player = { mc_uuid: string; mc_username: string; discord_id: string | null };
type Team = { id: string; name: string; abbreviation: string };
type StatRow = {
  mc_uuid: string; mc_username: string; team: Team | null;
  gp: number | null; ppg: number | null; rpg: number | null; apg: number | null;
};
type Accolade = { id: string; type: string; mc_uuid: string };
type PlayerTeam = { mc_uuid: string; team_id: string; season: string | null };
type TeamRecord = { team_id: string; wins: number; losses: number };

const na = (v: number | null | undefined, dec = 0) =>
  v == null ? "—" : dec > 0 ? v.toFixed(dec) : String(Math.round(v));

export default function PlayersPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [statsMap, setStatsMap] = React.useState<Record<string, StatRow>>({});
  const [accolades, setAccolades] = React.useState<Accolade[]>([]);
  const [recordMap, setRecordMap] = React.useState<Record<string, { wins: number; losses: number }>>({});
  const [playerTeams, setPlayerTeams] = React.useState<PlayerTeam[]>([]);
  const [sorted, setSorted] = React.useState<Player[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch("/api/players").then(r => r.json()),
      fetch(`/api/stats?league=${slug}&season=all&type=regular`).then(r => r.json()),
      fetch(`/api/accolades?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams/records?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then(r => r.json()),
    ]).then(([players, stats, accs, records, pt]) => {
      const playersArr: Player[] = Array.isArray(players) ? players : [];
      const statsArr: StatRow[] = Array.isArray(stats) ? stats : [];
      const sm: Record<string, StatRow> = {};
      statsArr.forEach(s => { sm[s.mc_uuid] = s; });
      setStatsMap(sm);
      setAccolades(Array.isArray(accs) ? accs : []);

      const rmap: Record<string, { wins: number; losses: number }> = {};
      if (Array.isArray(records)) records.forEach((r: TeamRecord) => { rmap[r.team_id] = { wins: r.wins, losses: r.losses }; });
      setRecordMap(rmap);

      const ptArr: PlayerTeam[] = Array.isArray(pt) ? pt : [];
      setPlayerTeams(ptArr);

      const leagueUuids = new Set(ptArr.map(p => p.mc_uuid));
      const leaguePlayers = playersArr.filter(p => leagueUuids.has(p.mc_uuid) || sm[p.mc_uuid]);
      const s2 = [...leaguePlayers].sort((a, b) => (sm[b.mc_uuid]?.ppg ?? 0) - (sm[a.mc_uuid]?.ppg ?? 0));
      setSorted(s2);
      setLoading(false);
    });
  }, [slug]);

  const getRecord = (uuid: string) => {
    const teams = playerTeams.filter(pt => pt.mc_uuid === uuid);
    let wins = 0, losses = 0;
    for (const pt of teams) {
      const rec = recordMap[pt.team_id];
      if (rec) { wins += rec.wins; losses += rec.losses; }
    }
    return { wins, losses };
  };

  const filtered = search.trim()
    ? sorted.filter(p => p.mc_username.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Players</h2>
          <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
        </div>
        <input
          className="rounded-lg border border-slate-700 bg-slate-800 text-white text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
          placeholder="Search players..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading players...</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No players found.</div>
      ) : (
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(p => {
            const st = statsMap[p.mc_uuid];
            const rings = accolades.filter(a => a.mc_uuid === p.mc_uuid && a.type === "Finals Champion");
            const rec = getRecord(p.mc_uuid);
            return (
              <Link
                key={p.mc_uuid}
                href={`/${slug}/players/${encodeURIComponent(p.mc_username)}`}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 text-left hover:border-slate-500 hover:bg-slate-800/50 transition group block"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={`https://minotar.net/avatar/${p.mc_username}/48`}
                    alt={p.mc_username}
                    className="w-12 h-12 rounded-lg ring-1 ring-slate-700 flex-shrink-0 group-hover:ring-slate-500 transition"
                    onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/48"; }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate">{p.mc_username}</div>
                    <div className="text-xs text-slate-500 truncate">{st?.team?.name ?? "—"}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {(rec.wins > 0 || rec.losses > 0) && (
                        <span className="text-xs text-slate-400 tabular-nums">{rec.wins}-{rec.losses}</span>
                      )}
                      {rings.length > 0 && (
                        <span className="text-sm">{rings.map(() => "🏆").join("")}</span>
                      )}
                    </div>
                  </div>
                </div>
                {st ? (
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {[
                      { label: "PPG", value: na(st.ppg, 1) },
                      { label: "RPG", value: na(st.rpg, 1) },
                      { label: "APG", value: na(st.apg, 1) },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-md bg-slate-900 border border-slate-800 py-1.5">
                        <div className="text-xs text-slate-500">{label}</div>
                        <div className="text-sm font-bold text-white tabular-nums">{value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 text-center py-1">No stats yet</div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
