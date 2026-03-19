"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Minecraft Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; division: string | null; logo_url: string | null };
type Player = { mc_uuid: string; mc_username: string };
type PlayerTeam = { mc_uuid: string; team_id: string; players: Player };

export default function TeamsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [teams, setTeams] = React.useState<Team[]>([]);
  const [playerTeams, setPlayerTeams] = React.useState<PlayerTeam[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!slug) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/teams?league=${slug}`).then((r) => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then((r) => r.json()),
    ])
      .then(([t, pt]) => {
        setTeams(Array.isArray(t) ? t : []);
        setPlayerTeams(Array.isArray(pt) ? pt : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  const playersForTeam = (teamId: string) => playerTeams.filter((pt) => pt.team_id === teamId);
  const divisions = [...new Set(teams.map((t) => t.division).filter(Boolean))] as string[];
  const hasDivisions = divisions.length > 0;

  const renderTeamCard = (team: Team) => (
    <div key={team.id} className="rounded-xl border border-slate-700 bg-slate-950 p-5 hover:border-slate-600 transition">
      <div className="flex items-center gap-3 mb-4">
        {team.logo_url ? (
          <img src={team.logo_url} alt={team.abbreviation} className="w-12 h-12 rounded object-contain flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-slate-300">{team.abbreviation}</span>
          </div>
        )}
        <div>
          <h3 className="font-bold text-white text-lg leading-tight">{team.name}</h3>
          <span className="text-slate-500 text-sm font-mono">{team.abbreviation}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {playersForTeam(team.id).length === 0 ? (
          <p className="text-slate-600 text-xs">No players assigned</p>
        ) : (
          playersForTeam(team.id).map((pt) => (
            <div key={pt.mc_uuid} className="flex items-center gap-2">
              <img src={`https://minotar.net/avatar/${pt.players?.mc_username}/20`} alt="" className="w-5 h-5 rounded" onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }} />
              <span className="text-slate-300 text-sm">{pt.players?.mc_username}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800">
        <h2 className="text-2xl font-bold text-white">Teams</h2>
        <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay} · {teams.length} teams</p>
      </div>
      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No teams yet.</div>
      ) : hasDivisions ? (
        <div className="p-6 space-y-8">
          {divisions.map((div) => (
            <div key={div}>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{div} Division</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.filter((t) => t.division === div).map(renderTeamCard)}
              </div>
            </div>
          ))}
          {teams.filter((t) => !t.division).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Other</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.filter((t) => !t.division).map(renderTeamCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(renderTeamCard)}
        </div>
      )}
    </div>
  );
}