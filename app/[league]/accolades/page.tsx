"use client";

import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Accolade = {
  id: string;
  type: string;
  season: string;
  description: string | null;
  mc_uuid: string;
  players?: { mc_uuid: string; mc_username: string } | null;
};

type RecordEntry = { mc_uuid: string; mc_username: string; value: number; season: string };
type Records = {
  season?: Record<string, RecordEntry>;
  seasonAvg?: Record<string, RecordEntry>;
  career?: Record<string, RecordEntry>;
  careerAvg?: Record<string, RecordEntry>;
};

function PlayerFace({ username, size = 40 }: { username: string; size?: number }) {
  return (
    <img
      src={`https://minotar.net/avatar/${username || "MHF_Steve"}/${size}`}
      alt=""
      className="shrink-0 rounded-lg border border-slate-700 bg-slate-950"
      style={{ width: size, height: size }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://minotar.net/avatar/MHF_Steve/${size}`; }}
    />
  );
}

function RecordCard({ label, entry, suffix }: { label: string; entry?: RecordEntry; suffix?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 transition hover:border-slate-600">
      <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
      {!entry || !entry.mc_uuid ? (
        <div className="text-sm font-bold text-slate-600">No data</div>
      ) : (
        <div className="flex items-center gap-3">
          <PlayerFace username={entry.mc_username} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-white">{entry.mc_username || entry.mc_uuid}</div>
            <div className="truncate text-[10px] font-bold text-slate-500">{entry.season}</div>
          </div>
          <div className="shrink-0 text-base font-black tabular-nums text-sky-300">
            {entry.value.toLocaleString()}{suffix ?? ""}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">{title}</h3>;
}

function awardLabel(type: string) {
  return type.startsWith("Single Game Record:")
    ? `${type.replace("Single Game Record:", "Single Game").trim()} Record`
    : type;
}

export default function AccoladesPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [accolades, setAccolades] = React.useState<Accolade[]>([]);
  const [gameRecords, setGameRecords] = React.useState<Accolade[]>([]);
  const [records, setRecords] = React.useState<Records | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [season, setSeason] = React.useState("All");

  React.useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/accolades?league=${slug}`).then((r) => r.json()),
      fetch(`/api/stats/records?league=${slug}`).then((r) => r.json()),
    ]).then(([accoladesData, recordsData]) => {
      const all = Array.isArray(accoladesData) ? accoladesData : [];
      setGameRecords(all.filter((a: Accolade) => a.type.startsWith("Single Game Record:")));
      setAccolades(all.filter((a: Accolade) => a.type !== "Finals Champion" && !a.type.startsWith("Single Game Record:")));
      setRecords(recordsData && !recordsData.error ? recordsData : null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug]);

  const availableSeasons = [...new Set(accolades.map((a) => a.season.replace(/ Playoffs$/, "")))].sort();
  const filtered = season === "All" ? accolades : accolades.filter((a) => a.season === season || a.season === `${season} Playoffs`);
  const groupedSeasons = [...new Set(filtered.map((a) => a.season))].sort((a, b) => b.localeCompare(a));

  const singleGameMap = React.useMemo(() => {
    const map: Record<string, RecordEntry> = {};
    for (const a of gameRecords) {
      const key = a.type.replace("Single Game Record:", "").trim().toLowerCase();
      const value = parseFloat((a.description ?? "").match(/^(\d+(\.\d+)?)/)?.[1] ?? "0");
      map[key] = { mc_uuid: a.mc_uuid, mc_username: a.players?.mc_username ?? a.mc_uuid, value, season: a.season };
    }
    return map;
  }, [gameRecords]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-950 to-red-950/30 px-6 py-6 shadow-xl">
        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-red-400">{leagueDisplay}</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-white">Accolades</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">Awards, single-game records, season records, and career leaders.</p>
      </div>

      {records && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0b0f16] shadow-xl">
          <div className="border-b border-slate-800 bg-slate-950 px-5 py-4">
            <h2 className="text-xl font-black text-white">Records</h2>
            <p className="mt-0.5 text-xs text-slate-500">{leagueDisplay} all-time bests from box scores</p>
          </div>
          <div className="space-y-6 p-4">
            {Object.keys(singleGameMap).length > 0 && (
              <section>
                <SectionTitle title="Single Game" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <RecordCard label="Most Points in a Game" entry={singleGameMap.pts} />
                  <RecordCard label="Most Rebounds in a Game" entry={singleGameMap.reb} />
                  <RecordCard label="Most Assists in a Game" entry={singleGameMap.ast} />
                  <RecordCard label="Most Steals in a Game" entry={singleGameMap.stl} />
                  <RecordCard label="Most Blocks in a Game" entry={singleGameMap.blk} />
                  <RecordCard label="Most Turnovers in a Game" entry={singleGameMap.tov} />
                </div>
              </section>
            )}
            <section>
              <SectionTitle title="Season Totals" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <RecordCard label="Most Points" entry={records.season?.points} />
                <RecordCard label="Most Assists" entry={records.season?.assists} />
                <RecordCard label="Most Rebounds" entry={records.season?.rebounds} />
                <RecordCard label="Most Steals" entry={records.season?.steals} />
                <RecordCard label="Most Blocks" entry={records.season?.blocks} />
              </div>
            </section>
            <section>
              <SectionTitle title="Season Averages" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <RecordCard label="Highest PPG" entry={records.seasonAvg?.ppg} suffix=" PPG" />
                <RecordCard label="Highest APG" entry={records.seasonAvg?.apg} suffix=" APG" />
                <RecordCard label="Highest RPG" entry={records.seasonAvg?.rpg} suffix=" RPG" />
                <RecordCard label="Highest SPG" entry={records.seasonAvg?.spg} suffix=" SPG" />
                <RecordCard label="Highest BPG" entry={records.seasonAvg?.bpg} suffix=" BPG" />
              </div>
            </section>
            <section>
              <SectionTitle title="Career Totals" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <RecordCard label="Career Points" entry={records.career?.points} />
                <RecordCard label="Career Assists" entry={records.career?.assists} />
                <RecordCard label="Career Rebounds" entry={records.career?.rebounds} />
                <RecordCard label="Career Steals" entry={records.career?.steals} />
                <RecordCard label="Career Blocks" entry={records.career?.blocks} />
              </div>
            </section>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0b0f16] shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-5 py-4">
          <div>
            <h2 className="text-xl font-black text-white">Award History</h2>
            <p className="mt-0.5 text-xs text-slate-500">{leagueDisplay}</p>
          </div>
          <div className="flex overflow-x-auto rounded-lg border border-slate-700 text-xs">
            {["All", ...availableSeasons].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeason(s)}
                className={`whitespace-nowrap px-3 py-2 font-black transition ${season === s ? "bg-red-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No accolades for {season === "All" ? "this league" : season} yet.</div>
        ) : (
          <div className="space-y-5 p-4">
            {groupedSeasons.map((s) => (
              <section key={s}>
                <SectionTitle title={s} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.filter((a) => a.season === s).sort((a, b) => {
                    const order: Record<string, number> = { MVP: 0, OPY: 1, DPOY: 2 };
                    return (order[a.type] ?? 99) - (order[b.type] ?? 99) || a.type.localeCompare(b.type);
                  }).map((a) => {
                    const username = a.players?.mc_username ?? a.mc_uuid;
                    return (
                      <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 transition hover:border-slate-600">
                        <div className="mb-3 flex items-center gap-3">
                          <PlayerFace username={username} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-white">{username}</div>
                            <div className="text-[10px] font-bold text-slate-500">{a.season}</div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2">
                          <div className="text-xs font-black text-white">{awardLabel(a.type)}</div>
                          {a.description && <div className="mt-1 text-[11px] text-slate-400">{a.description}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
