"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Accolade = {
  id: string; type: string; season: string; description: string | null;
  mc_uuid: string; players: { mc_uuid: string; mc_username: string };
};

type RecordEntry = {
  mc_uuid: string;
  mc_username: string;
  value: number;
  season: string;
};

type Records = {
  season: Record<string, RecordEntry>;
  seasonAvg: Record<string, RecordEntry>;
  career: Record<string, RecordEntry>;
  careerAvg: Record<string, RecordEntry>;
  game: Record<string, RecordEntry>;
};

function PlayerFace({ username }: { username: string }) {
  return (
    <img
      src={`https://minotar.net/avatar/${username || "MHF_Steve"}/32`}
      alt={username}
      className="w-8 h-8 rounded flex-shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }}
    />
  );
}

function RecordCard({ label, entry, suffix }: { label: string; entry: RecordEntry | undefined; suffix?: string }) {
  if (!entry || !entry.mc_uuid) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
        <div className="text-xs text-slate-500 mb-1">{label}</div>
        <div className="text-slate-600 text-sm">No data</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 hover:border-slate-700 transition">
      <div className="text-[9px] text-slate-600 uppercase tracking-wide mb-1.5">{label}</div>
      <div className="flex items-center gap-2">
        <PlayerFace username={entry.mc_username} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white text-xs truncate">{entry.mc_username || entry.mc_uuid}</div>
          <div className="text-[9px] text-slate-600 truncate">{entry.season}</div>
        </div>
        <div className="ml-auto text-sm font-bold text-blue-400 flex-shrink-0 tabular-nums">
          {entry.value.toLocaleString()}{suffix ?? ""}
        </div>
      </div>
    </div>
  );
}

export default function AccoladesPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [accolades, setAccolades] = React.useState<Accolade[]>([]);
  const [records, setRecords] = React.useState<Records | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [season, setSeason] = React.useState("All");

  React.useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/accolades?league=${slug}`).then((r) => r.json()),
      fetch(`/api/stats/records?league=${slug}`).then((r) => r.json()),
    ]).then(([accoladesData, recordsData]) => {
      const filtered = Array.isArray(accoladesData)
        ? accoladesData.filter((a: Accolade) => a.type !== "Finals Champion")
        : [];
      setAccolades(filtered);
      if (recordsData && !recordsData.error) setRecords(recordsData);
      setLoading(false);
    });
  }, [slug]);

  const availableSeasons = [...new Set(
    accolades.map((a) => a.season.replace(/ Playoffs$/, ""))
  )].sort();

  const filtered =
    season === "All"
      ? accolades
      : accolades.filter((a) => a.season === season || a.season === `${season} Playoffs`);

  const groupedSeasons = [...new Set(filtered.map((a) => a.season))].sort();

  return (
    <div className="space-y-5">
      {/* Records */}
      {records && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white">Records</h2>
            <p className="text-slate-500 text-xs mt-0.5">{leagueDisplay} — all-time bests from box scores</p>
          </div>
          <div className="p-4 space-y-5">
            {/* Game Records */}
            {records.game && (
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Single Game</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <RecordCard label="Most Points in a Game"    entry={records.game?.points} />
                  <RecordCard label="Most Rebounds in a Game"  entry={records.game?.rebounds} />
                  <RecordCard label="Most Assists in a Game"   entry={records.game?.assists} />
                  <RecordCard label="Most Steals in a Game"    entry={records.game?.steals} />
                  <RecordCard label="Most Blocks in a Game"    entry={records.game?.blocks} />
                  <RecordCard label="Most Turnovers in a Game" entry={records.game?.turnovers} />
                </div>
              </div>
            )}

            {/* Season Records */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Season Totals</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <RecordCard label="Most Points in a Season" entry={records.season?.points} />
                <RecordCard label="Most Assists in a Season" entry={records.season?.assists} />
                <RecordCard label="Most Rebounds in a Season" entry={records.season?.rebounds} />
                <RecordCard label="Most Steals in a Season" entry={records.season?.steals} />
                <RecordCard label="Most Blocks in a Season" entry={records.season?.blocks} />
              </div>
            </div>

            {/* Season Average Records */}
            {records.seasonAvg && (
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Season Averages</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  <RecordCard label="Highest PPG in a Season" entry={records.seasonAvg?.ppg} suffix=" PPG" />
                  <RecordCard label="Highest APG in a Season" entry={records.seasonAvg?.apg} suffix=" APG" />
                  <RecordCard label="Highest RPG in a Season" entry={records.seasonAvg?.rpg} suffix=" RPG" />
                  <RecordCard label="Highest SPG in a Season" entry={records.seasonAvg?.spg} suffix=" SPG" />
                  <RecordCard label="Highest BPG in a Season" entry={records.seasonAvg?.bpg} suffix=" BPG" />
                </div>
              </div>
            )}

            {/* Career Totals */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Career Totals</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <RecordCard label="Most Career Points" entry={records.career?.points} />
                <RecordCard label="Most Career Assists" entry={records.career?.assists} />
                <RecordCard label="Most Career Rebounds" entry={records.career?.rebounds} />
                <RecordCard label="Most Career Steals" entry={records.career?.steals} />
                <RecordCard label="Most Career Blocks" entry={records.career?.blocks} />
              </div>
            </div>

            {/* Career Averages */}
            {records.careerAvg && (
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Career Averages</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  <RecordCard label="Best Career PPG" entry={records.careerAvg?.ppg} suffix=" PPG" />
                  <RecordCard label="Best Career APG" entry={records.careerAvg?.apg} suffix=" APG" />
                  <RecordCard label="Best Career RPG" entry={records.careerAvg?.rpg} suffix=" RPG" />
                  <RecordCard label="Best Career SPG" entry={records.careerAvg?.spg} suffix=" SPG" />
                  <RecordCard label="Best Career BPG" entry={records.careerAvg?.bpg} suffix=" BPG" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Accolades */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Accolades</h2>
            <p className="text-slate-500 text-xs mt-0.5">{leagueDisplay}</p>
          </div>
          <div className="flex rounded-md border border-slate-700 overflow-hidden text-xs overflow-x-auto">
            <button
              onClick={() => setSeason("All")}
              className={`px-3 py-1.5 font-medium transition whitespace-nowrap ${
                season === "All" ? "bg-zinc-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              All
            </button>
            {availableSeasons.map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`px-3 py-1.5 font-medium transition whitespace-nowrap ${
                  season === s ? "bg-zinc-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No accolades for {season === "All" ? "this league" : season} yet.</div>
        ) : (
          <div className="p-4 space-y-5">
            {groupedSeasons.map((s) => (
              <div key={s}>
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{s}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filtered.filter((a) => a.season === s).sort((a, b) => {
                    const order: Record<string, number> = { MVP: 0, OPY: 1, DPOY: 2 };
                    const aRank = order[a.type] ?? 99;
                    const bRank = order[b.type] ?? 99;
                    if (aRank !== bRank) return aRank - bRank;
                    return a.type.localeCompare(b.type);
                  }).map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-3 hover:border-slate-700 transition">
                      <div className="flex items-center gap-2.5 mb-2">
                        <img
                          src={`https://minotar.net/avatar/${a.players?.mc_username ?? "MHF_Steve"}/32`}
                          alt={a.players?.mc_username}
                          className="w-8 h-8 rounded-md ring-1 ring-slate-700 flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }}
                        />
                        <div>
                          <div className="font-semibold text-white text-sm leading-tight">{a.players?.mc_username ?? a.mc_uuid}</div>
                          <div className="text-[10px] text-slate-500">{a.season}</div>
                        </div>
                      </div>
                      <div className="rounded-md bg-slate-800/50 border border-slate-700/60 px-2.5 py-1.5">
                        <div className="font-bold text-white text-xs flex items-center gap-1.5">
                          {a.type.startsWith("Single Game Record:") && <span className="text-yellow-400">📋</span>}
                          {a.type.startsWith("Single Game Record:") ? a.type.replace("Single Game Record:", "Single Game").trim() + " Record" : a.type}
                        </div>
                        {a.description && <div className="text-slate-400 text-[10px] mt-0.5">{a.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
