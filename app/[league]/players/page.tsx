"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Minecraft Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

type Player = { mc_uuid: string; mc_username: string; discord_id: string | null };
type Team = { id: string; name: string; abbreviation: string };
type StatRow = {
  mc_uuid: string;
  mc_username: string;
  team: Team | null;
  gp: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  fg_pct: number | null;
  three_pt_made: number | null;
  tppg: number | null;
  three_pt_pct: number | null;
};
type Accolade = {
  id: string; type: string; season: string; description: string | null;
  mc_uuid: string; players: { mc_uuid: string; mc_username: string };
};
type PlayerTeam = { mc_uuid: string; team_id: string; season: string | null };
type TeamRecord = { team_id: string; wins: number; losses: number };

const na = (v: number | null | undefined, suffix = "") =>
  v == null ? "—" : `${v}${suffix}`;

function PlayerCard({
  player,
  stats,
  accolades,
  allTimeRecord,
  onClose,
}: {
  player: Player;
  stats: StatRow | null;
  accolades: Accolade[];
  allTimeRecord: { wins: number; losses: number };
  onClose: () => void;
}) {
  const rings = accolades.filter((a) => a.mc_uuid === player.mc_uuid && a.type === "Finals Champion");
  const otherAccolades = accolades.filter((a) => a.mc_uuid === player.mc_uuid && a.type !== "Finals Champion");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-slate-950 px-6 pt-6 pb-4 border-b border-slate-800">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition text-lg leading-none"
          >
            ✕
          </button>
          <div className="flex items-center gap-4">
            <img
              src={`https://minotar.net/avatar/${player.mc_username}/64`}
              alt={player.mc_username}
              className="w-16 h-16 rounded-xl ring-2 ring-slate-700 flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/64"; }}
            />
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white truncate">{player.mc_username}</h2>
              {stats?.team && (
                <p className="text-slate-400 text-sm">{stats.team.name}</p>
              )}
              {/* Rings */}
              {rings.length > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {rings.map((r) => (
                    <span
                      key={r.id}
                      title={`${r.season} Finals Champion`}
                      className="inline-flex items-center gap-1 rounded-full bg-yellow-950 border border-yellow-700 px-2 py-0.5 text-xs text-yellow-300"
                    >
                      🏆 {r.season}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[60vh]">
          {/* All-time record */}
          <div className="px-6 py-4 border-b border-slate-800">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">All-Time Record</h3>
            {allTimeRecord.wins === 0 && allTimeRecord.losses === 0 ? (
              <p className="text-slate-600 text-sm">No record data.</p>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-white tabular-nums">
                  {allTimeRecord.wins}-{allTimeRecord.losses}
                </span>
                {allTimeRecord.wins + allTimeRecord.losses > 0 && (
                  <span className="text-slate-400 text-sm">
                    ({Math.round(allTimeRecord.wins / (allTimeRecord.wins + allTimeRecord.losses) * 1000) / 10}% win rate)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* All-time stats */}
          <div className="px-6 py-4 border-b border-slate-800">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">All-Time Stats</h3>
            {!stats ? (
              <p className="text-slate-600 text-sm">No stats recorded.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {[
                  { label: "GP",   value: na(stats.gp) },
                  { label: "PPG",  value: na(stats.ppg) },
                  { label: "RPG",  value: na(stats.rpg) },
                  { label: "APG",  value: na(stats.apg) },
                  { label: "SPG",  value: na(stats.spg) },
                  { label: "BPG",  value: na(stats.bpg) },
                  { label: "FG%",  value: stats.fg_pct == null ? "—" : `${stats.fg_pct}%` },
                  { label: "3s",   value: na(stats.three_pt_made) },
                  { label: "3PPG", value: na(stats.tppg) },
                  { label: "3FG%", value: stats.three_pt_pct == null ? "—" : `${stats.three_pt_pct}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-center">
                    <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                    <div className="text-sm font-bold text-white tabular-nums">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Finals */}
          <div className="px-6 py-4 border-b border-slate-800">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Finals</h3>
            {rings.length === 0 ? (
              <p className="text-slate-600 text-sm">No championships.</p>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-yellow-400 font-bold text-lg">{rings.length}×</span>
                <span className="text-yellow-300 text-sm">Finals Champion</span>
                <div className="flex gap-1 flex-wrap">
                  {rings.map((r) => (
                    <span key={r.id} className="text-xs text-yellow-500 bg-yellow-950 border border-yellow-800 rounded-full px-2 py-0.5">
                      {r.season}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Accolades */}
          <div className="px-6 py-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Accolades</h3>
            {otherAccolades.length === 0 ? (
              <p className="text-slate-600 text-sm">No accolades yet.</p>
            ) : (
              <div className="space-y-2">
                {otherAccolades.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-950 border border-slate-800 px-3 py-2">
                    <span className="font-semibold text-blue-300 text-sm">{a.type}</span>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">{a.season}</div>
                      {a.description && <div className="text-xs text-slate-600">{a.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlayersPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [players, setPlayers] = React.useState<Player[]>([]);
  const [statsMap, setStatsMap] = React.useState<Record<string, StatRow>>({});
  const [accolades, setAccolades] = React.useState<Accolade[]>([]);
  const [recordMap, setRecordMap] = React.useState<Record<string, { wins: number; losses: number }>>({});
  const [playerTeams, setPlayerTeams] = React.useState<PlayerTeam[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Player | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch("/api/players").then((r) => r.json()),
      fetch(`/api/stats?league=${slug}&season=all&type=combined`).then((r) => r.json()),
      fetch(`/api/accolades?league=${slug}`).then((r) => r.json()),
      fetch(`/api/teams/records?league=${slug}`).then((r) => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then((r) => r.json()),
    ]).then(([p, s, a, rec, pt]) => {
      setPlayers(Array.isArray(p) ? p : []);
      const map: Record<string, StatRow> = {};
      if (Array.isArray(s)) s.forEach((row: StatRow) => { map[row.mc_uuid] = row; });
      setStatsMap(map);
      setAccolades(Array.isArray(a) ? a : []);
      // Build record map keyed by team_id
      const rmap: Record<string, { wins: number; losses: number }> = {};
      if (Array.isArray(rec)) rec.forEach((r: TeamRecord) => { rmap[r.team_id] = { wins: r.wins, losses: r.losses }; });
      setRecordMap(rmap);
      setPlayerTeams(Array.isArray(pt) ? pt : []);
      setLoading(false);
    });
  }, [slug]);

  // Compute all-time W/L for a player
  const getRecord = (uuid: string) => {
    const teams = playerTeams.filter((pt) => pt.mc_uuid === uuid);
    let wins = 0, losses = 0;
    for (const pt of teams) {
      const rec = recordMap[pt.team_id];
      if (rec) { wins += rec.wins; losses += rec.losses; }
    }
    return { wins, losses };
  };

  const filtered = search.trim()
    ? players.filter((p) => p.mc_username.toLowerCase().includes(search.toLowerCase()))
    : players;

  const sorted = [...filtered].sort((a, b) => {
    const as = statsMap[a.mc_uuid];
    const bs = statsMap[b.mc_uuid];
    if (!as && !bs) return 0;
    if (!as) return 1;
    if (!bs) return -1;
    return (bs.ppg ?? 0) - (as.ppg ?? 0);
  });

  return (
    <>
      {selected && (
        <PlayerCard
          player={selected}
          stats={statsMap[selected.mc_uuid] ?? null}
          accolades={accolades}
          allTimeRecord={getRecord(selected.mc_uuid)}
          onClose={() => setSelected(null)}
        />
      )}

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
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">Loading players...</div>
        ) : sorted.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No players found.</div>
        ) : (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sorted.map((p) => {
              const st = statsMap[p.mc_uuid];
              const rings = accolades.filter((a) => a.mc_uuid === p.mc_uuid && a.type === "Finals Champion");
              const rec = getRecord(p.mc_uuid);
              return (
                <button
                  key={p.mc_uuid}
                  onClick={() => setSelected(p)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 text-left hover:border-slate-500 hover:bg-slate-800/50 transition group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <img
                      src={`https://minotar.net/avatar/${p.mc_username}/48`}
                      alt={p.mc_username}
                      className="w-12 h-12 rounded-lg ring-1 ring-slate-700 flex-shrink-0 group-hover:ring-slate-500 transition"
                      onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/48"; }}
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
                        { label: "PPG", value: na(st.ppg) },
                        { label: "RPG", value: na(st.rpg) },
                        { label: "APG", value: na(st.apg) },
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
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
