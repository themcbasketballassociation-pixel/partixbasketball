"use client";
import React, { useState, useEffect, useRef } from "react";

const MAX_GUESSES = 5;

// ── Types ────────────────────────────────────────────────────────────────────

type Team = { id: string; name: string; abbreviation: string; division: string | null };
type StatRow = {
  mc_uuid: string; mc_username: string;
  team: Team | null;
  ppg: number | null; rpg: number | null; apg: number | null; gp: number | null;
};
type Accolade = { mc_uuid: string; type: string };

type Profile = {
  mc_uuid: string;
  mc_username: string;
  team: Team | null;
  division: string | null;
  ppg: number;
  rpg: number;
  apg: number;
  rings: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDayNum() {
  return Math.floor(Date.now() / 86400000);
}

type Color = "green" | "yellow" | "gray";
type CellResult = { color: Color; arrow?: "up" | "down" };

function numCmp(g: number, s: number, greenRange: number, yellowRange: number): CellResult {
  const diff = Math.abs(g - s);
  const color: Color = diff === 0 ? "green" : diff <= greenRange ? "yellow" : "gray";
  const arrow = g < s ? "up" : g > s ? "down" : undefined;
  return { color, arrow };
}

type GuessResult = {
  profile: Profile;
  team: CellResult;
  division: CellResult;
  ppg: CellResult;
  rpg: CellResult;
  apg: CellResult;
  rings: CellResult;
};

function compare(guess: Profile, secret: Profile): GuessResult {
  return {
    profile: guess,
    team:     { color: guess.team?.id === secret.team?.id ? "green" : "gray" },
    division: { color: (guess.division ?? "None") === (secret.division ?? "None") ? "green" : "gray" },
    ppg:   numCmp(guess.ppg,   secret.ppg,   2,   5),
    rpg:   numCmp(guess.rpg,   secret.rpg,   1.5, 3),
    apg:   numCmp(guess.apg,   secret.apg,   1,   2),
    rings: numCmp(guess.rings, secret.rings, 0,   1),
  };
}

const colorCls: Record<Color, string> = {
  green:  "bg-green-950  border-green-800  text-green-200",
  yellow: "bg-yellow-950 border-yellow-800 text-yellow-200",
  gray:   "bg-slate-900  border-slate-700  text-slate-400",
};

// ── Components ────────────────────────────────────────────────────────────────

function GuessRow({ result, reveal }: { result: GuessResult; reveal: boolean }) {
  const won = result.profile.mc_uuid !== undefined; // always true
  const cols: { key: keyof Omit<GuessResult, "profile">; label: string; val: string }[] = [
    { key: "team",     label: "Team",  val: result.profile.team?.abbreviation ?? "—"  },
    { key: "division", label: "Div",   val: result.profile.division ?? "—"             },
    { key: "ppg",      label: "PPG",   val: result.profile.ppg.toFixed(1)              },
    { key: "rpg",      label: "RPG",   val: result.profile.rpg.toFixed(1)              },
    { key: "apg",      label: "APG",   val: result.profile.apg.toFixed(1)              },
    { key: "rings",    label: "Rings", val: String(result.profile.rings)               },
  ];

  return (
    <div className="flex items-stretch gap-1.5">
      {/* Avatar + Name */}
      <div className="flex items-center gap-2 w-36 flex-shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5">
        <img
          src={`https://minotar.net/avatar/${result.profile.mc_username}/28`}
          alt={result.profile.mc_username}
          className="w-7 h-7 rounded ring-1 ring-slate-700 flex-shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/28"; }}
        />
        <span className="text-xs font-semibold text-white truncate">{reveal ? result.profile.mc_username : "???"}</span>
      </div>
      {/* Attribute cells */}
      {cols.map(({ key, label, val }) => {
        const cell = result[key] as CellResult;
        return (
          <div
            key={key}
            className={`flex flex-col items-center justify-center rounded-lg border ${colorCls[cell.color]} flex-1 min-w-0 px-1 py-1.5 text-center`}
          >
            <div className="text-[9px] leading-none text-slate-500 mb-0.5 uppercase tracking-wider">{label}</div>
            <div className="text-xs font-bold flex items-center gap-0.5 leading-none">
              {cell.arrow === "up"   && <span className="text-[10px]">↑</span>}
              {cell.arrow === "down" && <span className="text-[10px]">↓</span>}
              <span>{val}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="flex items-stretch gap-1.5 opacity-25">
      <div className="w-36 flex-shrink-0 h-12 rounded-lg border border-slate-800 bg-slate-950" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex-1 min-w-0 h-12 rounded-lg border border-slate-800 bg-slate-950" />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WordlePage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const dayNum = getDayNum();

  const [profiles, setProfiles]   = useState<Profile[]>([]);
  const [secret, setSecret]       = useState<Profile | null>(null);
  const [loading, setLoading]     = useState(true);
  const [guesses, setGuesses]     = useState<GuessResult[]>([]);
  const [gameState, setGameState] = useState<"playing" | "won" | "lost">("playing");
  const [selected, setSelected]   = useState<Profile | null>(null);
  const [search, setSearch]       = useState("");
  const [open, setOpen]           = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Load data
  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/stats?league=${slug}&season=all&type=combined`).then(r => r.json()),
      fetch(`/api/accolades?league=${slug}`).then(r => r.json()),
    ]).then(([stats, accolades]) => {
      const statsArr: StatRow[]  = Array.isArray(stats)     ? stats     : [];
      const accsArr:  Accolade[] = Array.isArray(accolades) ? accolades : [];

      const rings: Record<string, number> = {};
      for (const a of accsArr) {
        if (a.type === "Finals Champion") rings[a.mc_uuid] = (rings[a.mc_uuid] ?? 0) + 1;
      }

      const all: Profile[] = statsArr
        .filter(s => (s.gp ?? 0) > 0)
        .map(s => ({
          mc_uuid:      s.mc_uuid,
          mc_username:  s.mc_username,
          team:         s.team,
          division:     s.team?.division ?? null,
          ppg:          s.ppg  ?? 0,
          rpg:          s.rpg  ?? 0,
          apg:          s.apg  ?? 0,
          rings:        rings[s.mc_uuid] ?? 0,
        }));

      setProfiles(all);
      if (all.length > 0) setSecret(all[dayNum % all.length]);
      setLoading(false);
    });
  }, [slug, dayNum]);

  const guessedIds  = new Set(guesses.map(g => g.profile.mc_uuid));
  const isDone      = gameState !== "playing";
  const isWon       = gameState === "won";

  const filtered = profiles.filter(p =>
    !guessedIds.has(p.mc_uuid) &&
    (search.trim() ? p.mc_username.toLowerCase().includes(search.toLowerCase()) : true)
  );

  const submitGuess = () => {
    if (!selected || !secret || isDone) return;
    const result = compare(selected, secret);
    const next   = [...guesses, result];
    setGuesses(next);
    setSelected(null);
    setSearch("");
    setOpen(false);

    if (selected.mc_uuid === secret.mc_uuid) {
      setGameState("won");
    } else if (next.length >= MAX_GUESSES) {
      setGameState("lost");
    }
  };

  const colHeaders = ["Team", "Div", "PPG", "RPG", "APG", "Rings"];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white">Player Wordle</h2>
          <p className="text-slate-400 text-sm mt-0.5">Day #{dayNum} · Guess the mystery player in {MAX_GUESSES} tries</p>
        </div>
        {isDone && (
          <div className={`text-sm font-semibold px-3 py-1 rounded-lg border ${isWon ? "bg-green-950 border-green-800 text-green-300" : "bg-red-950 border-red-900 text-red-300"}`}>
            {isWon ? `🎉 ${guesses.length}/${MAX_GUESSES}` : `💀 ${guesses.length}/${MAX_GUESSES}`}
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading players...</div>
      ) : !secret ? (
        <div className="p-10 text-center text-slate-500">No player data available.</div>
      ) : (
        <div className="p-5 space-y-4">

          {/* Legend */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-950 border border-green-800 inline-block" /> Exact match</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-950 border border-yellow-800 inline-block" /> Close (↑↓ = direction to target)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-900 border border-slate-700 inline-block" /> No match</span>
          </div>

          {/* Column headers */}
          {guesses.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-36 flex-shrink-0" />
              {colHeaders.map(h => (
                <div key={h} className="flex-1 min-w-0 text-center text-[10px] text-slate-600 uppercase tracking-wider">{h}</div>
              ))}
            </div>
          )}

          {/* Guess rows */}
          <div className="space-y-1.5">
            {guesses.map((g, i) => (
              <GuessRow key={i} result={g} reveal={isDone || g.profile.mc_uuid === secret.mc_uuid} />
            ))}
            {Array.from({ length: MAX_GUESSES - guesses.length }).map((_, i) => (
              <EmptyRow key={i} />
            ))}
          </div>

          {/* Win / Lose result */}
          {isDone && (
            <div className={`rounded-xl border p-4 text-center ${isWon ? "border-green-800 bg-green-950" : "border-red-900 bg-red-950"}`}>
              {isWon ? (
                <>
                  <div className="text-2xl font-bold text-green-300 mb-1">🎉 Correct!</div>
                  <div className="text-green-400 text-sm">You got it in {guesses.length} guess{guesses.length !== 1 ? "es" : ""}!</div>
                </>
              ) : (
                <>
                  <div className="text-xl font-bold text-red-300 mb-2">Better luck tomorrow!</div>
                  <div className="flex items-center justify-center gap-2">
                    <img
                      src={`https://minotar.net/avatar/${secret.mc_username}/36`}
                      className="w-9 h-9 rounded-lg ring-2 ring-red-800"
                      onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }}
                    />
                    <span className="text-white font-bold text-lg">{secret.mc_username}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Guess input */}
          {!isDone && (
            <div ref={dropRef} className="relative">
              <div className="flex gap-2">
                {selected ? (
                  <button
                    className="flex-1 flex items-center gap-2 rounded-lg border border-blue-600 bg-slate-800 px-3 py-2 text-sm text-left hover:border-slate-500 transition"
                    onClick={() => { setSelected(null); setSearch(""); setOpen(true); }}
                  >
                    <img
                      src={`https://minotar.net/avatar/${selected.mc_username}/24`}
                      className="w-5 h-5 rounded flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
                    />
                    <span className="text-white flex-1">{selected.mc_username}</span>
                    <span className="text-slate-500 text-xs">▼</span>
                  </button>
                ) : (
                  <input
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    placeholder="Search for a player..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                  />
                )}
                <button
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  onClick={submitGuess}
                  disabled={!selected}
                >
                  Guess
                </button>
              </div>
              {open && !selected && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 shadow-xl max-h-64 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-500">No players found</div>
                  ) : (
                    filtered.slice(0, 30).map(p => (
                      <button
                        key={p.mc_uuid}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-slate-800 transition"
                        onClick={() => { setSelected(p); setSearch(""); setOpen(false); }}
                      >
                        <img
                          src={`https://minotar.net/avatar/${p.mc_username}/24`}
                          className="w-5 h-5 rounded flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
                        />
                        <span className="text-white flex-1">{p.mc_username}</span>
                        {p.team && <span className="text-slate-500 text-xs">{p.team.abbreviation}</span>}
                        {p.rings > 0 && <span className="text-yellow-500 text-xs">{"🏆".repeat(p.rings)}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer hint */}
          {!isDone && (
            <p className="text-xs text-slate-600 text-center">
              {MAX_GUESSES - guesses.length} guess{MAX_GUESSES - guesses.length !== 1 ? "es" : ""} remaining · {profiles.length} eligible players
            </p>
          )}
        </div>
      )}
    </div>
  );
}
