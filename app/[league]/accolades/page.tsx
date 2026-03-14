"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Partix Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

const SEASONS = ["Season 1","Season 1 Playoffs","Season 2","Season 2 Playoffs","Season 3","Season 3 Playoffs","Season 4","Season 4 Playoffs","Season 5","Season 5 Playoffs","Season 6","Season 6 Playoffs","Season 7","Season 7 Playoffs"];

type Accolade = {
  id: string; type: string; season: string; description: string | null;
  mc_uuid: string; players: { mc_uuid: string; mc_username: string };
};

export default function AccoladesPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [accolades, setAccolades] = React.useState<Accolade[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [season, setSeason] = React.useState("All");

  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/accolades?league=${slug}`)
      .then((r) => r.json())
      .then((data) => { setAccolades(Array.isArray(data) ? data : []); setLoading(false); });
  }, [slug]);

  const filtered = season === "All" ? accolades : accolades.filter((a) => a.season === season);
  const seasons = [...new Set(filtered.map((a) => a.season))];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Accolades</h2>
          <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
        </div>
        <div className="flex rounded-lg border border-slate-700 overflow-hidden text-sm overflow-x-auto">
          {SEASONS.map((s) => (
            <button
              key={s}
              onClick={() => setSeason(s)}
              className={`px-3 py-1.5 font-medium transition whitespace-nowrap ${
                season === s ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
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
        <div className="p-6 space-y-6">
          {seasons.map((s) => (
            <div key={s}>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{s}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.filter((a) => a.season === s).map((a) => (
                  <div key={a.id} className="rounded-xl border border-slate-700 bg-slate-950 px-5 py-4 hover:border-slate-600 transition">
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={`https://minotar.net/avatar/${a.players?.mc_username}/40`}
                        alt={a.players?.mc_username}
                        className="w-10 h-10 rounded-lg ring-1 ring-slate-700 flex-shrink-0"
                      />
                      <div>
                        <div className="font-semibold text-white">{a.players?.mc_username ?? a.mc_uuid}</div>
                        <div className="text-xs text-slate-500">{a.season}</div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-blue-950 border border-blue-800 px-3 py-2">
                      <div className="font-bold text-blue-300 text-sm">{a.type}</div>
                      {a.description && <div className="text-blue-400 text-xs mt-0.5">{a.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}