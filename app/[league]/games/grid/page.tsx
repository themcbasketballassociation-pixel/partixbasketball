"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";

const TOTAL_GUESSES = 9;
const LAUNCH_DAY_NUM = Math.floor(new Date("2026-03-17T00:00:00Z").getTime() / 86400000);
function getDayNum() {
  return Math.max(1, Math.floor(Date.now() / 86400000) - LAUNCH_DAY_NUM + 1);
}

// ── Types ────────────────────────────────────────────────────────────────────

type Team = { id: string; name: string; abbreviation: string; division: string | null; season: string | null };
type StatRow = { mc_uuid: string; ppg: number | null; rpg: number | null; apg: number | null; gp: number | null };
type Accolade = { mc_uuid: string; type: string };
type PlayerTeamEntry = { mc_uuid: string; team_id: string; teams: Team; season: string | null };
type Player = { mc_uuid: string; mc_username: string };

type Category =
  | { type: "team";     teamName: string; teamIds: string[]; label: string }
  | { type: "division"; division: "East" | "West";           label: string }
  | { type: "ppg";      min: number;                         label: string }
  | { type: "rpg";      min: number;                         label: string }
  | { type: "apg";      min: number;                         label: string }
  | { type: "gp";       min: number;                         label: string }
  | { type: "rings";                                          label: string }
  | { type: "accolade"; accoladeType: string;                 label: string };

type CellState =
  | { status: "empty" }
  | { status: "correct"; player: Player };

// ── Helpers ───────────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed | 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playerFits(
  uuid: string,
  cat: Category,
  ptMap:         Record<string, PlayerTeamEntry[]>,
  statsMap:      Record<string, StatRow>,
  ringMap:       Record<string, number>,
  accoladeMap:   Record<string, string[]>,
): boolean {
  const pts   = ptMap[uuid]       ?? [];
  const stats = statsMap[uuid];
  switch (cat.type) {
    case "team":     return pts.some(pt => cat.teamIds.includes(pt.team_id));
    case "division": return pts.some(pt => pt.teams?.division === cat.division);
    case "ppg":      return stats != null && (stats.ppg ?? 0) >= cat.min;
    case "rpg":      return stats != null && (stats.rpg ?? 0) >= cat.min;
    case "apg":      return stats != null && (stats.apg ?? 0) >= cat.min;
    case "gp":       return stats != null && (stats.gp  ?? 0) >= cat.min;
    case "rings":    return (ringMap[uuid] ?? 0) >= 1;
    case "accolade": return (accoladeMap[uuid] ?? []).includes(cat.accoladeType);
  }
}

function generateGrid(
  dayNum:      number,
  allTeams:    Team[],
  ptMap:       Record<string, PlayerTeamEntry[]>,
  statsMap:    Record<string, StatRow>,
  ringMap:     Record<string, number>,
  accoladeMap: Record<string, string[]>,
  uuids:       string[],
  allAccolades: Accolade[],
): { rows: Category[]; cols: Category[] } | null {

  // ── Row pool: teams (deduplicated by name) + divisions ───────────────────
  const byName: Record<string, string[]> = {};
  for (const t of allTeams) {
    const n = t.name.trim();
    if (!byName[n]) byName[n] = [];
    byName[n].push(t.id);
  }
  const teamCats: Category[] = Object.entries(byName)
    .filter(([, ids]) => uuids.some(u => (ptMap[u] ?? []).some(pt => ids.includes(pt.team_id))))
    .map(([name, ids]) => ({ type: "team" as const, teamName: name, teamIds: ids, label: name }));

  const divCats: Category[] = [];
  if (uuids.some(u => (ptMap[u] ?? []).some(pt => pt.teams?.division === "East")))
    divCats.push({ type: "division", division: "East", label: "East Division" });
  if (uuids.some(u => (ptMap[u] ?? []).some(pt => pt.teams?.division === "West")))
    divCats.push({ type: "division", division: "West", label: "West Division" });

  const rowPool: Category[] = [...teamCats, ...divCats];

  // ── Column pool: stats, GP, rings, specific award types ─────────────────
  const maybeColCats: Category[] = [
    { type: "ppg", min: 10, label: "PPG ≥ 10" },
    { type: "ppg", min: 15, label: "PPG ≥ 15" },
    { type: "ppg", min: 20, label: "PPG ≥ 20" },
    { type: "rpg", min: 5,  label: "RPG ≥ 5"  },
    { type: "rpg", min: 7,  label: "RPG ≥ 7"  },
    { type: "apg", min: 3,  label: "APG ≥ 3"  },
    { type: "apg", min: 5,  label: "APG ≥ 5"  },
    { type: "gp",  min: 10, label: "GP ≥ 10"  },
    { type: "gp",  min: 20, label: "GP ≥ 20"  },
    { type: "gp",  min: 30, label: "GP ≥ 30"  },
    { type: "gp",  min: 50, label: "GP ≥ 50"  },
  ];
  const colPool: Category[] = maybeColCats.filter(c =>
    uuids.some(u => playerFits(u, c, ptMap, statsMap, ringMap, accoladeMap))
  );

  // "Won Finals" (rings)
  if (uuids.some(u => (ringMap[u] ?? 0) >= 1))
    colPool.push({ type: "rings", label: "Won Finals 🏆" });

  // Specific accolade types (exclude Finals Champion — covered by rings)
  const accoladeTypeCounts: Record<string, number> = {};
  for (const a of allAccolades) {
    if (a.type !== "Finals Champion") {
      accoladeTypeCounts[a.type] = (accoladeTypeCounts[a.type] ?? 0) + 1;
    }
  }
  for (const [type, count] of Object.entries(accoladeTypeCounts)) {
    if (count >= 2) { // require at least 2 players with this award so cells aren't unsolvable
      colPool.push({ type: "accolade", accoladeType: type, label: type });
    }
  }

  if (rowPool.length < 3 || colPool.length < 3) return null;

  for (let attempt = 0; attempt < 100; attempt++) {
    const rng  = seededRng(dayNum * 137 + attempt);
    const rows = shuffled(rowPool, rng).slice(0, 3);
    const cols = shuffled(colPool, rng).slice(0, 3);

    // No duplicate labels
    const labels = [...rows, ...cols].map(c => c.label);
    if (new Set(labels).size < 6) continue;

    // Every cell must have ≥1 valid player
    let valid = true;
    outer: for (const row of rows) {
      for (const col of cols) {
        const ok = uuids.some(u =>
          playerFits(u, row, ptMap, statsMap, ringMap, accoladeMap) &&
          playerFits(u, col, ptMap, statsMap, ringMap, accoladeMap)
        );
        if (!ok) { valid = false; break outer; }
      }
    }
    if (valid) return { rows, cols };
  }
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GridCell({
  cell, onClick, flash, disabled,
}: {
  cell: CellState; onClick: () => void; flash: boolean; disabled: boolean;
}) {
  if (cell.status === "correct") {
    return (
      <div className="rounded-xl border-2 border-green-700 bg-green-950 flex flex-col items-center justify-center gap-1 p-1.5 min-h-[90px]">
        <img
          src={`https://minotar.net/avatar/${cell.player.mc_username}/36`}
          className="w-9 h-9 rounded-lg ring-2 ring-green-700"
          onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }}
        />
        <span className="text-[10px] font-bold text-green-200 text-center leading-tight w-full text-center break-all line-clamp-2 px-0.5">
          {cell.player.mc_username}
        </span>
      </div>
    );
  }

  return (
    <button
      className={`rounded-xl border-2 flex flex-col items-center justify-center min-h-[90px] transition
        ${flash
          ? "border-red-600 bg-red-950"
          : disabled
            ? "border-slate-800 bg-slate-950 opacity-40 cursor-not-allowed"
            : "border-slate-700 bg-slate-950 hover:border-blue-500 hover:bg-slate-800/60 cursor-pointer"
        }`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="text-2xl text-slate-700">+</span>
    </button>
  );
}

function CategoryHeader({ cat }: { cat: Category }) {
  const cls =
    cat.type === "division" && cat.division === "East" ? "bg-orange-950 border-orange-800 text-orange-300" :
    cat.type === "division" && cat.division === "West" ? "bg-blue-950 border-blue-800 text-blue-300" :
    cat.type === "rings"    || cat.type === "accolade" ? "bg-yellow-950 border-yellow-800 text-yellow-300" :
    cat.type === "team"                                ? "bg-slate-900 border-slate-700 text-white" :
                                                         "bg-green-950 border-green-800 text-green-300";
  return (
    <div className={`rounded-xl border flex items-center justify-center text-center px-1.5 py-2 min-h-[56px] ${cls}`}>
      <span className="text-[11px] font-semibold leading-tight">{cat.label}</span>
    </div>
  );
}

function PlayerModal({
  row, col, allPlayers, usedUuids, ptMap, statsMap, ringMap, accoladeMap,
  onSelect, onClose,
}: {
  row: Category; col: Category;
  allPlayers: Player[]; usedUuids: Set<string>;
  ptMap: Record<string, PlayerTeamEntry[]>;
  statsMap: Record<string, StatRow>;
  ringMap: Record<string, number>;
  accoladeMap: Record<string, string[]>;
  onSelect: (player: Player, correct: boolean) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const available = allPlayers.filter(p => !usedUuids.has(p.mc_uuid));
  const filtered  = search.trim()
    ? available.filter(p => p.mc_username.toLowerCase().includes(search.toLowerCase()))
    : available;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-slate-800">
          <button className="float-right text-slate-500 hover:text-white text-lg leading-none" onClick={onClose}>✕</button>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1.5">Pick a player who…</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-lg bg-orange-950 border border-orange-800 text-orange-300 text-xs font-semibold px-2 py-1">{row.label}</span>
            <span className="text-slate-500 text-xs font-bold">+</span>
            <span className="rounded-lg bg-blue-950 border border-blue-800 text-blue-300 text-xs font-semibold px-2 py-1">{col.label}</span>
          </div>
        </div>
        <div className="px-4 py-2.5 border-b border-slate-800">
          <input
            ref={inputRef}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            placeholder="Search player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-800">
          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-500">No players found</div>
          ) : (
            filtered.slice(0, 40).map(p => (
              <button
                key={p.mc_uuid}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left hover:bg-slate-800 transition"
                onClick={() => {
                  const correct =
                    playerFits(p.mc_uuid, row, ptMap, statsMap, ringMap, accoladeMap) &&
                    playerFits(p.mc_uuid, col, ptMap, statsMap, ringMap, accoladeMap);
                  onSelect(p, correct);
                }}
              >
                <img
                  src={`https://minotar.net/avatar/${p.mc_username}/28`}
                  className="w-7 h-7 rounded ring-1 ring-slate-700 flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/28"; }}
                />
                <span className="text-white font-medium">{p.mc_username}</span>
                {(ringMap[p.mc_uuid] ?? 0) > 0 && (
                  <span className="text-yellow-500 text-xs ml-auto">{"🏆".repeat(Math.min(ringMap[p.mc_uuid], 3))}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GridPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const dayNum = getDayNum();

  const [allPlayers,  setAllPlayers]  = useState<Player[]>([]);
  const [statsMap,    setStatsMap]    = useState<Record<string, StatRow>>({});
  const [ringMap,     setRingMap]     = useState<Record<string, number>>({});
  const [accoladeMap, setAccoladeMap] = useState<Record<string, string[]>>({});
  const [ptMap,       setPtMap]       = useState<Record<string, PlayerTeamEntry[]>>({});
  const [allAccolades, setAllAccolades] = useState<Accolade[]>([]);
  const [rows,  setRows]  = useState<Category[]>([]);
  const [cols,  setCols]  = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [noGrid,  setNoGrid]  = useState(false);

  const [cells,       setCells]       = useState<CellState[]>(Array(9).fill({ status: "empty" }));
  const [guessesLeft, setGuessesLeft] = useState(TOTAL_GUESSES);
  const [usedUuids,   setUsedUuids]   = useState<Set<string>>(new Set());
  const [activeCell,  setActiveCell]  = useState<number | null>(null);
  const [flashCell,   setFlashCell]   = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/stats?league=${slug}&season=all&type=combined`).then(r => r.json()),
      fetch(`/api/accolades?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams?league=${slug}`).then(r => r.json()),
      fetch(`/api/players`).then(r => r.json()),
    ]).then(([stats, accolades, playerTeams, teams, players]) => {
      const statsArr:   StatRow[]         = Array.isArray(stats)       ? stats       : [];
      const accsArr:    Accolade[]        = Array.isArray(accolades)   ? accolades   : [];
      const ptArr:      PlayerTeamEntry[] = Array.isArray(playerTeams) ? playerTeams : [];
      const teamsArr:   Team[]            = Array.isArray(teams)       ? teams       : [];
      const playersArr: Player[]          = Array.isArray(players)     ? players     : [];

      const sm: Record<string, StatRow>     = {};
      const rm: Record<string, number>      = {};
      const pm: Record<string, PlayerTeamEntry[]> = {};
      const am: Record<string, string[]>    = {};

      for (const s of statsArr)  sm[s.mc_uuid] = s;
      for (const a of accsArr) {
        if (a.type === "Finals Champion") rm[a.mc_uuid] = (rm[a.mc_uuid] ?? 0) + 1;
        if (!am[a.mc_uuid]) am[a.mc_uuid] = [];
        if (!am[a.mc_uuid].includes(a.type)) am[a.mc_uuid].push(a.type);
      }
      for (const pt of ptArr) {
        if (!pm[pt.mc_uuid]) pm[pt.mc_uuid] = [];
        pm[pt.mc_uuid].push(pt);
      }

      setStatsMap(sm);
      setRingMap(rm);
      setAccoladeMap(am);
      setPtMap(pm);
      setAllAccolades(accsArr);

      // All players (not just stats-holders) are guessable
      setAllPlayers(playersArr);

      const uuids  = playersArr.map(p => p.mc_uuid);
      const grid   = generateGrid(dayNum, teamsArr, pm, sm, rm, am, uuids, accsArr);

      if (!grid) {
        setNoGrid(true);
      } else {
        setRows(grid.rows);
        setCols(grid.cols);
      }
      setLoading(false);
    });
  }, [slug, dayNum]);

  const solved = cells.filter(c => c.status === "correct").length;
  const isDone = guessesLeft === 0 || solved === 9;

  const handleCellClick = (idx: number) => {
    if (isDone || cells[idx].status === "correct") return;
    setActiveCell(idx);
  };

  const handleSelect = useCallback((player: Player, correct: boolean) => {
    if (activeCell === null) return;

    if (correct) {
      setCells(prev => {
        const next = [...prev];
        next[activeCell] = { status: "correct", player };
        return next;
      });
      setUsedUuids(prev => new Set([...prev, player.mc_uuid]));
    } else {
      setFlashCell(activeCell);
      setTimeout(() => setFlashCell(null), 700);
    }

    setGuessesLeft(prev => prev - 1);
    setActiveCell(null);
  }, [activeCell]);

  return (
    <>
      {activeCell !== null && rows.length > 0 && (
        <PlayerModal
          row={rows[Math.floor(activeCell / 3)]}
          col={cols[activeCell % 3]}
          allPlayers={allPlayers}
          usedUuids={usedUuids}
          ptMap={ptMap}
          statsMap={statsMap}
          ringMap={ringMap}
          accoladeMap={accoladeMap}
          onSelect={handleSelect}
          onClose={() => setActiveCell(null)}
        />
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-2xl font-bold text-white">Player Grid</h2>
            <p className="text-slate-400 text-sm mt-0.5">Day #{dayNum} · 9 total guesses — wrong answers still cost a guess</p>
          </div>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <span className="text-green-400">{solved}/9 filled</span>
            <span className="text-slate-600">·</span>
            <span className={guessesLeft <= 2 ? "text-red-400" : "text-slate-300"}>
              {guessesLeft} guess{guessesLeft !== 1 ? "es" : ""} left
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">Building today's grid...</div>
        ) : noGrid ? (
          <div className="p-10 text-center text-slate-500">Not enough data to generate a grid for this league yet.</div>
        ) : (
          <div className="p-4">
            {/*
              Grid layout — all visible at once without scrolling.
              Use a fixed CSS grid: 4 cols (label + 3) × 4 rows (label + 3).
              Each cell is square-ish via min-h.
            */}
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: "minmax(80px,1fr) repeat(3, minmax(0,1fr))",
              }}
            >
              {/* Top-left corner */}
              <div />

              {/* Column headers */}
              {cols.map((col, ci) => (
                <CategoryHeader key={ci} cat={col} />
              ))}

              {/* Rows */}
              {rows.map((row, ri) => (
                <React.Fragment key={ri}>
                  {/* Row header */}
                  <CategoryHeader cat={row} />

                  {/* 3 cells */}
                  {cols.map((_, ci) => {
                    const idx = ri * 3 + ci;
                    return (
                      <GridCell
                        key={ci}
                        cell={cells[idx]}
                        onClick={() => handleCellClick(idx)}
                        flash={flashCell === idx}
                        disabled={isDone && cells[idx].status !== "correct"}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>

            {/* Game over */}
            {isDone && (
              <div className={`mt-4 rounded-xl border p-4 text-center ${solved === 9 ? "border-green-800 bg-green-950" : "border-slate-700 bg-slate-950"}`}>
                {solved === 9 ? (
                  <div className="text-xl font-bold text-green-300">
                    🎉 Perfect Grid! Used {TOTAL_GUESSES - guessesLeft} guess{TOTAL_GUESSES - guessesLeft !== 1 ? "es" : ""}
                  </div>
                ) : (
                  <div>
                    <div className="text-xl font-bold text-white mb-1">{solved}/9 cells complete</div>
                    <div className="text-slate-400 text-sm">Come back tomorrow for a new grid!</div>
                  </div>
                )}
              </div>
            )}

            {/* Instructions */}
            {!isDone && (
              <p className="mt-3 text-xs text-slate-600 text-center">
                Click any empty cell and pick a player matching <em>both</em> the row and column. Wrong guesses still count. Each player can only be used once.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
