"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";

const TOTAL_GUESSES = 9;
// Day 1 starts 2026-03-17 at 10 AM EST (15:00 UTC). Advances every 24 h at 10 AM EST.
const EPOCH_MS = new Date("2026-03-19T15:00:00Z").getTime();
const SEASON_SEED = Math.floor(EPOCH_MS / 86400000); // auto-changes with epoch
function getDayNum() {
  return Math.max(1, Math.floor((Date.now() - EPOCH_MS) / 86400000) + 1);
}

// ── Types ────────────────────────────────────────────────────────────────────

type Team = { id: string; name: string; abbreviation: string; division: string | null; season: string | null };
type StatRow = { mc_uuid: string; ppg: number | null; rpg: number | null; apg: number | null; gp: number | null };
type Accolade = { mc_uuid: string; type: string };
type PlayerTeamEntry = { mc_uuid: string; team_id: string; teams: Team; season: string | null };
type Player = { mc_uuid: string; mc_username: string };

type SeasonRow = { mc_uuid: string; season: string; ppg: number | null; rpg: number | null; apg: number | null; gp: number | null };

type Category =
  | { type: "team";        teamName: string; teamIds: string[]; label: string }
  | { type: "division";    division: "East" | "West";           label: string }
  | { type: "ppg";         min: number;                         label: string }
  | { type: "rpg";         min: number;                         label: string }
  | { type: "apg";         min: number;                         label: string }
  | { type: "gp";          min: number;                         label: string }
  | { type: "rings";                                             label: string }
  | { type: "accolade";    accoladeType: string;                 label: string }
  // single-season thresholds
  | { type: "szn_ppg";     min: number; seasonSet: Set<string>; label: string }
  | { type: "szn_rpg";     min: number; seasonSet: Set<string>; label: string }
  | { type: "szn_apg";     min: number; seasonSet: Set<string>; label: string }
  | { type: "playoff_ppg"; min: number; seasonSet: Set<string>; label: string }
  // career totals
  | { type: "career_pts";  min: number; playerSet: Set<string>; label: string }
  | { type: "career_reb";  min: number; playerSet: Set<string>; label: string }
  | { type: "career_ast";  min: number; playerSet: Set<string>; label: string }
  // played with
  | { type: "played_with"; refUuid: string; refName: string; refTeamIds: Set<string>; label: string };

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
    case "team":        return pts.some(pt => cat.teamIds.includes(pt.team_id));
    case "division":    return pts.some(pt => pt.teams?.division === cat.division);
    case "ppg":         return stats != null && (stats.ppg ?? 0) >= cat.min;
    case "rpg":         return stats != null && (stats.rpg ?? 0) >= cat.min;
    case "apg":         return stats != null && (stats.apg ?? 0) >= cat.min;
    case "gp":          return stats != null && (stats.gp  ?? 0) >= cat.min;
    case "rings":       return (ringMap[uuid] ?? 0) >= 1;
    case "accolade":    return (accoladeMap[uuid] ?? []).includes(cat.accoladeType);
    case "szn_ppg":     return cat.seasonSet.has(uuid);
    case "szn_rpg":     return cat.seasonSet.has(uuid);
    case "szn_apg":     return cat.seasonSet.has(uuid);
    case "playoff_ppg": return cat.seasonSet.has(uuid);
    case "career_pts":  return cat.playerSet.has(uuid);
    case "career_reb":  return cat.playerSet.has(uuid);
    case "career_ast":  return cat.playerSet.has(uuid);
    case "played_with": return uuid !== cat.refUuid && (ptMap[uuid] ?? []).some(pt => cat.refTeamIds.has(pt.team_id));
  }
}

/**
 * Backtracking check: can we assign 9 DISTINCT players to 9 cells?
 * Processes most-constrained cells first for fast pruning.
 */
function checkValidAssignment(cellPlayers: string[][]): boolean {
  const order = [...Array(cellPlayers.length).keys()]
    .sort((a, b) => cellPlayers[a].length - cellPlayers[b].length);
  const used = new Set<string>();
  function bt(pos: number): boolean {
    if (pos === order.length) return true;
    for (const p of cellPlayers[order[pos]]) {
      if (!used.has(p)) {
        used.add(p);
        if (bt(pos + 1)) return true;
        used.delete(p);
      }
    }
    return false;
  }
  return bt(0);
}

function generateGrid(
  dayNum:         number,
  allTeams:       Team[],
  ptMap:          Record<string, PlayerTeamEntry[]>,
  statsMap:       Record<string, StatRow>,
  ringMap:        Record<string, number>,
  accoladeMap:    Record<string, string[]>,
  uuids:          string[],
  allAccolades:   Accolade[],
  seasonRows:     SeasonRow[],
  playerNameMap:  Record<string, string>,
): { rows: Category[]; cols: Category[] } | null {

  // ── Precompute season-based sets ─────────────────────────────────────────

  // Build per-player max regular-season and max playoff-season stats
  const maxSznPPG: Record<string, number> = {};
  const maxSznRPG: Record<string, number> = {};
  const maxSznAPG: Record<string, number> = {};
  const maxPOPPG:  Record<string, number> = {};
  for (const row of seasonRows) {
    const isPlayoff = row.season?.toLowerCase().includes("playoff");
    if (!isPlayoff) {
      if (row.ppg != null) maxSznPPG[row.mc_uuid] = Math.max(maxSznPPG[row.mc_uuid] ?? 0, row.ppg);
      if (row.rpg != null) maxSznRPG[row.mc_uuid] = Math.max(maxSznRPG[row.mc_uuid] ?? 0, row.rpg);
      if (row.apg != null) maxSznAPG[row.mc_uuid] = Math.max(maxSznAPG[row.mc_uuid] ?? 0, row.apg);
    } else {
      if (row.ppg != null) maxPOPPG[row.mc_uuid]  = Math.max(maxPOPPG[row.mc_uuid]  ?? 0, row.ppg);
    }
  }

  function sznSet(map: Record<string, number>, min: number): Set<string> {
    return new Set(uuids.filter(u => (map[u] ?? 0) >= min));
  }

  // ── Build every possible category from available data ────────────────────

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

  // Season-stat threshold candidates
  const sznCandidates: Category[] = ([
    { type: "szn_ppg"     as const, min: 30, seasonSet: sznSet(maxSznPPG, 30), label: "30+ PPG Season" },
    { type: "szn_ppg"     as const, min: 25, seasonSet: sznSet(maxSznPPG, 25), label: "25+ PPG Season" },
    { type: "szn_ppg"     as const, min: 20, seasonSet: sznSet(maxSznPPG, 20), label: "20+ PPG Season" },
    { type: "szn_ppg"     as const, min: 15, seasonSet: sznSet(maxSznPPG, 15), label: "15+ PPG Season" },
    { type: "szn_rpg"     as const, min: 10, seasonSet: sznSet(maxSznRPG, 10), label: "10+ RPG Season" },
    { type: "szn_rpg"     as const, min: 8,  seasonSet: sznSet(maxSznRPG, 8),  label: "8+ RPG Season"  },
    { type: "szn_rpg"     as const, min: 5,  seasonSet: sznSet(maxSznRPG, 5),  label: "5+ RPG Season"  },
    { type: "szn_apg"     as const, min: 8,  seasonSet: sznSet(maxSznAPG, 8),  label: "8+ APG Season"  },
    { type: "szn_apg"     as const, min: 5,  seasonSet: sznSet(maxSznAPG, 5),  label: "5+ APG Season"  },
    { type: "szn_apg"     as const, min: 3,  seasonSet: sznSet(maxSznAPG, 3),  label: "3+ APG Season"  },
    { type: "playoff_ppg" as const, min: 20, seasonSet: sznSet(maxPOPPG, 20),  label: "20+ PPG Playoffs" },
    { type: "playoff_ppg" as const, min: 15, seasonSet: sznSet(maxPOPPG, 15),  label: "15+ PPG Playoffs" },
    { type: "playoff_ppg" as const, min: 10, seasonSet: sznSet(maxPOPPG, 10),  label: "10+ PPG Playoffs" },
  ] as Category[]).filter(c => (c as { seasonSet: Set<string> }).seasonSet.size >= 1);

  const statCandidates: Category[] = [
    { type: "ppg", min: 5,  label: "PPG ≥ 5"  },
    { type: "ppg", min: 10, label: "PPG ≥ 10" },
    { type: "ppg", min: 15, label: "PPG ≥ 15" },
    { type: "ppg", min: 20, label: "PPG ≥ 20" },
    { type: "rpg", min: 3,  label: "RPG ≥ 3"  },
    { type: "rpg", min: 5,  label: "RPG ≥ 5"  },
    { type: "rpg", min: 7,  label: "RPG ≥ 7"  },
    { type: "apg", min: 2,  label: "APG ≥ 2"  },
    { type: "apg", min: 3,  label: "APG ≥ 3"  },
    { type: "apg", min: 5,  label: "APG ≥ 5"  },
    { type: "gp",  min: 5,  label: "GP ≥ 5"   },
    { type: "gp",  min: 10, label: "GP ≥ 10"  },
    { type: "gp",  min: 20, label: "GP ≥ 20"  },
    { type: "gp",  min: 30, label: "GP ≥ 30"  },
    { type: "gp",  min: 50, label: "GP ≥ 50"  },
  ];
  const statCats = statCandidates.filter(c =>
    uuids.some(u => playerFits(u, c, ptMap, statsMap, ringMap, accoladeMap))
  );

  const ringCats: Category[] = [];
  if (uuids.some(u => (ringMap[u] ?? 0) >= 1))
    ringCats.push({ type: "rings", label: "Won Finals 🏆" });

  const accoladeTypeCounts: Record<string, number> = {};
  for (const a of allAccolades) {
    if (a.type !== "Finals Champion")
      accoladeTypeCounts[a.type] = (accoladeTypeCounts[a.type] ?? 0) + 1;
  }
  const accoladeCats: Category[] = Object.entries(accoladeTypeCounts)
    .filter(([, count]) => count >= 2)
    .map(([type]) => ({ type: "accolade" as const, accoladeType: type, label: type }));

  // ── Career total categories ──────────────────────────────────────────────

  function careerSet(map: Record<string, number>, min: number): Set<string> {
    return new Set(uuids.filter(u => (map[u] ?? 0) >= min));
  }
  const careerPTS: Record<string, number> = {};
  const careerREB: Record<string, number> = {};
  const careerAST: Record<string, number> = {};
  for (const u of uuids) {
    const s = statsMap[u];
    if (s) {
      careerPTS[u] = Math.round((s.ppg ?? 0) * (s.gp ?? 0));
      careerREB[u] = Math.round((s.rpg ?? 0) * (s.gp ?? 0));
      careerAST[u] = Math.round((s.apg ?? 0) * (s.gp ?? 0));
    }
  }
  const careerCandidates: Category[] = ([
    { type: "career_pts" as const, min: 1000, playerSet: careerSet(careerPTS, 1000), label: "1000+ Career PTS" },
    { type: "career_pts" as const, min: 500,  playerSet: careerSet(careerPTS, 500),  label: "500+ Career PTS"  },
    { type: "career_pts" as const, min: 250,  playerSet: careerSet(careerPTS, 250),  label: "250+ Career PTS"  },
    { type: "career_reb" as const, min: 500,  playerSet: careerSet(careerREB, 500),  label: "500+ Career REB"  },
    { type: "career_reb" as const, min: 250,  playerSet: careerSet(careerREB, 250),  label: "250+ Career REB"  },
    { type: "career_reb" as const, min: 100,  playerSet: careerSet(careerREB, 100),  label: "100+ Career REB"  },
    { type: "career_ast" as const, min: 300,  playerSet: careerSet(careerAST, 300),  label: "300+ Career AST"  },
    { type: "career_ast" as const, min: 150,  playerSet: careerSet(careerAST, 150),  label: "150+ Career AST"  },
    { type: "career_ast" as const, min: 75,   playerSet: careerSet(careerAST, 75),   label: "75+ Career AST"   },
  ] as Category[]).filter(c => (c as { playerSet: Set<string> }).playerSet.size >= 1);

  // ── Played-with categories ────────────────────────────────────────────────
  // For each uuid, find all team_ids they played on
  const playedWithCats: Category[] = [];
  for (const refUuid of uuids) {
    const refTeamIds = new Set((ptMap[refUuid] ?? []).map(pt => pt.team_id));
    if (refTeamIds.size === 0) continue;
    const teammates = uuids.filter(u =>
      u !== refUuid && (ptMap[u] ?? []).some(pt => refTeamIds.has(pt.team_id))
    );
    if (teammates.length >= 1) {
      const refName = playerNameMap[refUuid] ?? refUuid;
      playedWithCats.push({
        type: "played_with" as const,
        refUuid,
        refName,
        refTeamIds,
        label: `Teammate of ${refName}`,
      });
    }
  }

  const allCats: Category[] = [
    ...teamCats, ...divCats, ...statCats, ...sznCandidates, ...careerCandidates, ...ringCats, ...accoladeCats, ...playedWithCats,
  ];

  if (allCats.length < 6) return null;

  // Pre-filter: only keep categories that pair with ≥2 others
  const pairCount = allCats.map((a, i) =>
    allCats.reduce((n, b, j) => {
      if (i === j || a.label === b.label) return n;
      const ok = uuids.some(u =>
        playerFits(u, a, ptMap, statsMap, ringMap, accoladeMap) &&
        playerFits(u, b, ptMap, statsMap, ringMap, accoladeMap)
      );
      return n + (ok ? 1 : 0);
    }, 0)
  );
  const usable = allCats.filter((_, i) => pairCount[i] >= 2);

  if (usable.length < 6) return null;

  // Search for a valid 3×3 grid where 9 distinct players can fill all cells
  for (let attempt = 0; attempt < 500; attempt++) {
    const rng    = seededRng((SEASON_SEED + dayNum) * 137 + attempt);
    const picked = shuffled(usable, rng);
    const rows   = picked.slice(0, 3);
    const cols   = picked.slice(3, 6);

    const labels = [...rows, ...cols].map(c => c.label);
    if (new Set(labels).size < 6) continue;

    // Each cell must have ≥1 valid player
    let anyEmpty = false;
    const cellPlayers: string[][] = [];
    for (const row of rows) {
      for (const col of cols) {
        const valid = uuids.filter(u =>
          playerFits(u, row, ptMap, statsMap, ringMap, accoladeMap) &&
          playerFits(u, col, ptMap, statsMap, ringMap, accoladeMap)
        ).slice(0, 30); // cap for backtracking perf
        if (valid.length === 0) { anyEmpty = true; break; }
        cellPlayers.push(valid);
      }
      if (anyEmpty) break;
    }
    if (anyEmpty) continue;

    // Verify 9 DISTINCT players can fill all cells simultaneously
    if (!checkValidAssignment(cellPlayers)) continue;

    return { rows, cols };
  }
  return null;
}

// ── Share card ────────────────────────────────────────────────────────────────

const CELL_EMOJI = (s: CellState) => s.status === "correct" ? "🟩" : "⬛";

function GridShareModal({
  cells, guessesUsed, dayNum, onClose,
}: {
  cells: CellState[]; guessesUsed: number; dayNum: number; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const solved = cells.filter(c => c.status === "correct").length;

  const text = [
    `Partix Basketball Grid – Day #${dayNum}`,
    `${solved}/9 cells · ${guessesUsed}/${TOTAL_GUESSES} guesses`,
    "",
    cells.slice(0, 3).map(CELL_EMOJI).join(""),
    cells.slice(3, 6).map(CELL_EMOJI).join(""),
    cells.slice(6, 9).map(CELL_EMOJI).join(""),
  ].join("\n");

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold">Share Result</h3>
            <p className="text-slate-400 text-xs mt-0.5">Day #{dayNum} · {solved}/9 cells · {guessesUsed}/{TOTAL_GUESSES} guesses</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-col items-center gap-1.5">
            {[0, 1, 2].map(row => (
              <div key={row} className="flex gap-1">
                {[0, 1, 2].map(col => (
                  <span key={col} className="text-3xl leading-none">{CELL_EMOJI(cells[row * 3 + col])}</span>
                ))}
              </div>
            ))}
          </div>
          <button
            onClick={copy}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold transition ${
              copied ? "bg-green-700 text-green-200" : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {copied ? "✓ Copied!" : "📋 Copy to Clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AnswerCell({ validPlayers }: { validPlayers: Player[] }) {
  const show = validPlayers.slice(0, 7);
  const more = validPlayers.length - show.length;
  return (
    <div className="rounded-xl border-2 border-slate-700 bg-slate-950 p-2 min-h-[90px] max-h-44 overflow-y-auto">
      {show.length === 0 ? (
        <p className="text-slate-600 text-[10px] text-center mt-4">No valid players</p>
      ) : (
        <div className="space-y-1">
          {show.map(p => (
            <div key={p.mc_uuid} className="flex items-center gap-1.5">
              <img
                src={`https://minotar.net/avatar/${p.mc_username}/20`}
                className="w-5 h-5 rounded flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }}
              />
              <span className="text-[11px] text-slate-300 truncate leading-tight">{p.mc_username}</span>
            </div>
          ))}
          {more > 0 && <p className="text-slate-600 text-[10px] text-center pt-0.5">+{more} more</p>}
        </div>
      )}
    </div>
  );
}

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
        <span className="text-[10px] font-bold text-green-200 text-center leading-tight w-full break-all line-clamp-2 px-0.5">
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
    cat.type === "played_with"                         ? "bg-purple-950 border-purple-800 text-purple-200" :
    cat.type === "career_pts" || cat.type === "career_reb" || cat.type === "career_ast"
                                                       ? "bg-cyan-950 border-cyan-800 text-cyan-300" :
                                                         "bg-green-950 border-green-800 text-green-300";
  return (
    <div className={`rounded-xl border flex flex-col items-center justify-center text-center px-1.5 py-2 min-h-[56px] gap-1 ${cls}`}>
      {cat.type === "played_with" && (
        <img
          src={`https://minotar.net/avatar/${cat.refName}/20`}
          className="w-5 h-5 rounded flex-shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }}
          alt=""
        />
      )}
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
            filtered.map(p => (
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

// ── localStorage helpers ──────────────────────────────────────────────────────

type SavedState = { cells: CellState[]; guessesLeft: number; usedUuids: string[] };

function storageKey(league: string, day: number) {
  return `partix:grid:${league}:${SEASON_SEED}:${day}`;
}
function loadState(league: string, day: number): SavedState | null {
  try {
    const raw = localStorage.getItem(storageKey(league, day));
    return raw ? (JSON.parse(raw) as SavedState) : null;
  } catch { return null; }
}
function saveState(league: string, day: number, state: SavedState) {
  try { localStorage.setItem(storageKey(league, day), JSON.stringify(state)); } catch { /* ignore */ }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GridPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const dayNum = getDayNum();

  const { data: session, status: authStatus } = useSession();

  const [allPlayers,   setAllPlayers]   = useState<Player[]>([]);
  const [statsMap,     setStatsMap]     = useState<Record<string, StatRow>>({});
  const [ringMap,      setRingMap]      = useState<Record<string, number>>({});
  const [accoladeMap,  setAccoladeMap]  = useState<Record<string, string[]>>({});
  const [ptMap,        setPtMap]        = useState<Record<string, PlayerTeamEntry[]>>({});
  const [allAccolades, setAllAccolades] = useState<Accolade[]>([]);
  const [seasonRows,   setSeasonRows]   = useState<SeasonRow[]>([]);
  const [rows,  setRows]  = useState<Category[]>([]);
  const [cols,  setCols]  = useState<Category[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [noGrid,    setNoGrid]    = useState(false);

  const [cells,       setCells]       = useState<CellState[]>(Array(9).fill({ status: "empty" }));
  const [guessesLeft, setGuessesLeft] = useState(TOTAL_GUESSES);
  const [usedUuids,   setUsedUuids]   = useState<Set<string>>(new Set());
  const [activeCell,  setActiveCell]  = useState<number | null>(null);
  const [flashCell,   setFlashCell]   = useState<number | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [showShare,   setShowShare]   = useState(false);
  const [stateReady,  setStateReady]  = useState(false);

  // Load data + grid
  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/stats?league=${slug}&season=all&type=combined`).then(r => r.json()),
      fetch(`/api/accolades?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams?league=${slug}`).then(r => r.json()),
      fetch(`/api/players`).then(r => r.json()),
      fetch(`/api/stats/seasons?league=${slug}`).then(r => r.json()),
    ]).then(([stats, accolades, playerTeams, teams, players, seasons]) => {
      const statsArr:   StatRow[]         = Array.isArray(stats)       ? stats       : [];
      const accsArr:    Accolade[]        = Array.isArray(accolades)   ? accolades   : [];
      const ptArr:      PlayerTeamEntry[] = Array.isArray(playerTeams) ? playerTeams : [];
      const teamsArr:   Team[]            = Array.isArray(teams)       ? teams       : [];
      const playersArr: Player[]          = Array.isArray(players)     ? players     : [];
      const sznArr:     SeasonRow[]       = Array.isArray(seasons)     ? seasons     : [];
      setSeasonRows(sznArr);

      const sm: Record<string, StatRow>           = {};
      const rm: Record<string, number>            = {};
      const pm: Record<string, PlayerTeamEntry[]> = {};
      const am: Record<string, string[]>          = {};

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

      setStatsMap(sm); setRingMap(rm); setAccoladeMap(am); setPtMap(pm); setAllAccolades(accsArr);

      const leagueUuids = new Set([
        ...ptArr.map(pt => pt.mc_uuid),
        ...statsArr.map(s => s.mc_uuid),
      ]);
      const leaguePlayers = playersArr.filter(p => leagueUuids.has(p.mc_uuid));
      setAllPlayers(leaguePlayers);

      const uuids = leaguePlayers.map(p => p.mc_uuid);
      const nameMap: Record<string, string> = {};
      for (const p of playersArr) nameMap[p.mc_uuid] = p.mc_username;
      const grid  = generateGrid(dayNum, teamsArr, pm, sm, rm, am, uuids, accsArr, sznArr, nameMap);

      if (!grid) {
        setNoGrid(true);
      } else {
        setRows(grid.rows);
        setCols(grid.cols);

        // Restore persisted state for today
        const saved = loadState(slug, dayNum);
        if (saved) {
          setCells(saved.cells);
          setGuessesLeft(saved.guessesLeft);
          setUsedUuids(new Set(saved.usedUuids));
        }
      }
      setLoading(false);
      setStateReady(true);
    });
  }, [slug, dayNum]);

  // Persist state whenever it changes (after initial load)
  useEffect(() => {
    if (!stateReady || loading) return;
    saveState(slug, dayNum, { cells, guessesLeft, usedUuids: [...usedUuids] });
  }, [cells, guessesLeft, usedUuids, stateReady, loading, slug, dayNum]);

  const solved = cells.filter(c => c.status === "correct").length;
  const isDone = guessesLeft === 0 || solved === 9;
  const guessesUsed = TOTAL_GUESSES - guessesLeft;

  const handleCellClick = (idx: number) => {
    if (isDone || cells[idx].status === "correct") return;
    setActiveCell(idx);
  };

  const handleSelect = useCallback((player: Player, correct: boolean) => {
    if (activeCell === null) return;

    if (correct) {
      const next = [...cells] as CellState[];
      next[activeCell] = { status: "correct", player };
      setCells(next);
      setUsedUuids(prev => new Set([...prev, player.mc_uuid]));
      // Show share after final correct fill
      const newSolved = next.filter(c => c.status === "correct").length;
      if (guessesLeft - 1 <= 0 || newSolved === 9) {
        setTimeout(() => setShowShare(true), 700);
      }
    } else {
      setFlashCell(activeCell);
      setTimeout(() => setFlashCell(null), 700);
    }

    const newLeft = guessesLeft - 1;
    setGuessesLeft(newLeft);
    setActiveCell(null);

    // Show share when out of guesses
    if (newLeft <= 0) setTimeout(() => setShowShare(true), 700);
  }, [activeCell, cells, guessesLeft]);

  // ── Discord login gate ────────────────────────────────────────────────────

  if (authStatus === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 className="text-2xl font-bold text-white">Player Grid</h2>
          <p className="text-slate-400 text-sm mt-0.5">Day #{dayNum} · Fill the 3×3 grid with 9 guesses</p>
        </div>
        <div className="p-12 flex flex-col items-center gap-5 text-center">
          <div className="text-5xl">🔐</div>
          <div>
            <p className="text-white font-semibold text-lg">Sign in to play</p>
            <p className="text-slate-400 text-sm mt-1">
              Discord login is required to track your daily result and prevent replays.
            </p>
          </div>
          <button
            onClick={() => signIn("discord")}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 transition"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.017.012.033.026.044a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Sign in with Discord
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showShare && isDone && (
        <GridShareModal
          cells={cells}
          guessesUsed={guessesUsed}
          dayNum={dayNum}
          onClose={() => setShowShare(false)}
        />
      )}

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
            {isDone && (
              <button
                onClick={() => setShowShare(true)}
                className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 text-sm transition"
                title="Share result"
              >📋</button>
            )}
          </div>
        </div>

        {loading || authStatus === "loading" ? (
          <div className="p-10 text-center text-slate-500">Building today's grid...</div>
        ) : noGrid ? (
          <div className="p-10 text-center text-slate-500">Not enough data to generate a grid for this league yet.</div>
        ) : (
          <div className="p-4">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "minmax(80px,1fr) repeat(3, minmax(0,1fr))" }}
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
                  <CategoryHeader cat={row} />
                  {cols.map((col, ci) => {
                    const idx = ri * 3 + ci;
                    if (isDone && showAnswers && cells[idx].status !== "correct") {
                      const valid = allPlayers.filter(p =>
                        playerFits(p.mc_uuid, rows[ri], ptMap, statsMap, ringMap, accoladeMap) &&
                        playerFits(p.mc_uuid, col,      ptMap, statsMap, ringMap, accoladeMap)
                      );
                      return <AnswerCell key={ci} validPlayers={valid} />;
                    }
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
              <div className={`mt-4 rounded-xl border p-4 ${solved === 9 ? "border-green-800 bg-green-950" : "border-slate-700 bg-slate-950"}`}>
                <div className="text-center mb-3">
                  {solved === 9 ? (
                    <div className="text-xl font-bold text-green-300">
                      🎉 Perfect Grid! Used {guessesUsed} guess{guessesUsed !== 1 ? "es" : ""}
                    </div>
                  ) : (
                    <>
                      <div className="text-xl font-bold text-white mb-1">{solved}/9 cells complete</div>
                      <div className="text-slate-400 text-sm">Come back tomorrow for a new grid!</div>
                    </>
                  )}
                </div>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setShowShare(true)}
                    className="rounded-lg border border-blue-700 bg-blue-900 hover:bg-blue-800 text-blue-200 text-sm font-medium px-4 py-2 transition"
                  >
                    📋 Share Result
                  </button>
                  <button
                    onClick={() => setShowAnswers(v => !v)}
                    className="rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 transition"
                  >
                    {showAnswers ? "🙈 Hide Answers" : "👁 See Who Fits"}
                  </button>
                </div>
              </div>
            )}

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
