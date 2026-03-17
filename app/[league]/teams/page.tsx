"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Partix Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

const SEASONS = ["Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7"];

type Team = {
  id: string;
  name: string;
  abbreviation: string;
  league: string;
  division: string | null;
  logo_url: string | null;
};
type PlayerTeam = {
  mc_uuid: string;
  team_id: string;
  league: string;
  players: { mc_uuid: string; mc_username: string };
  teams: Team;
};

function TeamLogo({ team, size = 56 }: { team: Team; size?: number }) {
  if (team.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt={team.name}
        width={size}
        height={size}
        className="object-cover rounded-xl flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="font-bold text-slate-300" style={{ fontSize: Math.max(12, size * 0.28) }}>{team.abbreviation}</span>
    </div>
  );
}

function TeamCard({ team, roster }: { team: Team; roster: { mc_uuid: string; mc_username: string }[] }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-950 overflow-hidden hover:border-slate-600 transition">
      <div className="px-5 py-4 border-b border-slate-800/60 flex items-center gap-4 bg-slate-900/40">
        <TeamLogo team={team} size={64} />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-lg leading-tight truncate">{team.name}</h3>
          <p className="text-sm text-slate-500 mt-0.5 font-mono">{team.abbreviation}</p>
        </div>
        <span className="text-sm text-slate-500 flex-shrink-0">
          {roster.length} {roster.length === 1 ? "player" : "players"}
        </span>
      </div>
      {roster.length > 0 ? (
        <ul className="divide-y divide-slate-800/40">
          {roster.map((p) => (
            <li key={p.mc_uuid} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-800/20 transition">
              <img
                src={`https://minotar.net/avatar/${p.mc_username}/28`}
                alt={p.mc_username}
                className="w-7 h-7 rounded ring-1 ring-slate-700 flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/28"; }}
              />
              <span className="text-base text-slate-300">{p.mc_username}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-4 text-sm text-slate-600 italic">No players rostered</div>
      )}
    </div>
  );
}

function DivisionSection({
  label,
  color,
  teams,
  playersForTeam,
}: {
  label: string;
  color: "orange" | "blue";
  teams: Team[];
  playersForTeam: (id: string) => { mc_uuid: string; mc_username: string }[];
}) {
  return (
    <div>
      <div className={`flex items-center gap-3 px-6 py-3 border-b border-slate-800 ${color === "orange" ? "bg-orange-950/20" : "bg-blue-950/20"}`}>
        <span className={`text-xs font-bold uppercase tracking-widest ${color === "orange" ? "text-orange-400" : "text-blue-400"}`}>
          {label} Division
        </span>
        <span className="text-xs text-slate-600">{teams.length} teams</span>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {teams.map((team) => (
          <TeamCard key={team.id} team={team} roster={playersForTeam(team.id)} />
        ))}
      </div>
    </div>
  );
}

export default function TeamsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [season, setSeason] = React.useState(SEASONS[SEASONS.length - 1]);
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [playerTeams, setPlayerTeams] = React.useState<PlayerTeam[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/teams?league=${slug}&season=${encodeURIComponent(season)}`).then((r) => r.json()),
      fetch(`/api/teams/players?league=${slug}&season=${encodeURIComponent(season)}`).then((r) => r.json()),
    ]).then(([t, pt]) => {
      setTeams(Array.isArray(t) ? t : []);
      setPlayerTeams(Array.isArray(pt) ? pt : []);
      setLoading(false);
    });
  }, [slug, season]);

  const playersForTeam = (teamId: string) =>
    playerTeams.filter((pt) => pt.team_id === teamId).map((pt) => pt.players);

  const eastTeams = teams.filter((t) => t.division === "East");
  const westTeams = teams.filter((t) => t.division === "West");
  const undivided = teams.filter((t) => !t.division);
  const hasDivisions = eastTeams.length > 0 || westTeams.length > 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Teams</h2>
          <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay} · {teams.length} teams</p>
        </div>
        <select
          className="rounded-lg border border-slate-700 bg-slate-800 text-white text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
        >
          {SEASONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No teams for {season} yet.</div>
      ) : hasDivisions ? (
        <div className="divide-y divide-slate-800">
          {eastTeams.length > 0 && (
            <DivisionSection label="East" color="orange" teams={eastTeams} playersForTeam={playersForTeam} />
          )}
          {westTeams.length > 0 && (
            <DivisionSection label="West" color="blue" teams={westTeams} playersForTeam={playersForTeam} />
          )}
          {undivided.length > 0 && (
            <div>
              <div className="px-6 py-3 border-b border-slate-800">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Unassigned</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {undivided.map((team) => (
                  <TeamCard key={team.id} team={team} roster={playersForTeam(team.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} roster={playersForTeam(team.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
