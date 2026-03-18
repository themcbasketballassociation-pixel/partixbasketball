"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";

// Day advances at 10 AM EST (15:00 UTC)
const EPOCH_MS = new Date("2026-03-19T15:00:00Z").getTime();
const SEASON_SEED = Math.floor(EPOCH_MS / 86400000); // auto-changes with epoch
function getDayNum() {
  return Math.max(1, Math.floor((Date.now() - EPOCH_MS) / 86400000) + 1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type StatRow = { mc_uuid: string; ppg: number | null; rpg: number | null; apg: number | null; gp: number | null };
type SeasonRow = { mc_uuid: string; season: string; ppg: number | null; rpg: number | null; apg: number | null };
type PlayerTeamEntry = { mc_uuid: string; team_id: string; teams: { name: string; abbreviation: string }; season: string | null };
type Accolade = { mc_uuid: string; type: string };
type RawPlayer = { mc_uuid: string; mc_username: string };

type WordEntry = { word: string; clue: string; mc_uuid: string; username: string };
type Placement = { entry: WordEntry; row: number; col: number; dir: "across" | "down"; number: number };
type GridCell = { letter: string; placements: number[] } | null; // null = black cell

// ── Helpers ───────────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed | 1;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}
function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getMostRecentTeam(uuid: string, ptArr: PlayerTeamEntry[]) {
  const mine = ptArr.filter(pt => pt.mc_uuid === uuid);
  if (!mine.length) return null;
  const sorted = [...mine].sort((a, b) => {
    const na = a.season ? parseInt(a.season.replace(/\D/g, "") || "0") : -1;
    const nb = b.season ? parseInt(b.season.replace(/\D/g, "") || "0") : -1;
    return nb - na;
  });
  return sorted[0].teams ?? null;
}

/** Build a ranked list of clues for a player (most specific first) */
function buildClues(
  username: string, stats: StatRow | undefined, rings: number,
  team: { name: string; abbreviation: string } | null,
  maxSznPPG: number, maxPOPPG: number,
): string[] {
  const clues: string[] = [];
  // Specific numeric clues first (all unique per-player)
  if (maxSznPPG >= 25) clues.push(`Had a ${Math.floor(maxSznPPG)}+ PPG season`);
  if (maxPOPPG >= 20)  clues.push(`${Math.floor(maxPOPPG)}+ PPG in a playoff run`);
  if (stats && (stats.ppg ?? 0) >= 20) clues.push(`Averages ${stats.ppg?.toFixed(1)} PPG`);
  if (stats && (stats.rpg ?? 0) >= 8)  clues.push(`Averages ${stats.rpg?.toFixed(1)} RPG`);
  if (stats && (stats.apg ?? 0) >= 6)  clues.push(`Averages ${stats.apg?.toFixed(1)} APG`);
  if (stats && (stats.ppg ?? 0) > 0)   clues.push(`${stats.ppg?.toFixed(1)} PPG scorer`);
  // Generic fallbacks (may be shared — used only if unique slot available)
  if (rings > 0) clues.push(`${rings}× Finals champion`);
  if (team)      clues.push(`Played for ${team.name}`);
  clues.push(`${username.length}-letter Partix player`);
  return clues;
}

// ── Crossword generator ───────────────────────────────────────────────────────

const GRID_SIZE = 11;

function canPlace(
  grid: (string | null)[][],
  word: string,
  row: number, col: number,
  dir: "across" | "down",
  isFirst: boolean,
): boolean {
  const len = word.length;
  const dr = dir === "down" ? 1 : 0;
  const dc = dir === "across" ? 1 : 0;
  const endRow = row + dr * (len - 1);
  const endCol = col + dc * (len - 1);

  if (row < 0 || col < 0 || endRow >= GRID_SIZE || endCol >= GRID_SIZE) return false;

  // Cell before start must be empty
  const pr = row - dr, pc = col - dc;
  if (pr >= 0 && pc >= 0 && grid[pr][pc] !== null) return false;
  // Cell after end must be empty
  const nr = endRow + dr, nc = endCol + dc;
  if (nr < GRID_SIZE && nc < GRID_SIZE && grid[nr][nc] !== null) return false;

  let hasIntersection = isFirst;
  for (let i = 0; i < len; i++) {
    const r = row + dr * i, c = col + dc * i;
    const letter = word[i];
    const existing = grid[r][c];
    if (existing !== null) {
      if (existing !== letter) return false;
      hasIntersection = true;
    } else {
      // No adjacent parallel cells (perpendicular to direction)
      if (dir === "across") {
        if (r > 0 && grid[r - 1][c] !== null) return false;
        if (r < GRID_SIZE - 1 && grid[r + 1][c] !== null) return false;
      } else {
        if (c > 0 && grid[r][c - 1] !== null) return false;
        if (c < GRID_SIZE - 1 && grid[r][c + 1] !== null) return false;
      }
    }
  }
  return hasIntersection;
}

function placeWord(grid: (string | null)[][], word: string, row: number, col: number, dir: "across" | "down") {
  const dr = dir === "down" ? 1 : 0;
  const dc = dir === "across" ? 1 : 0;
  for (let i = 0; i < word.length; i++) grid[row + dr * i][col + dc * i] = word[i];
}

function generateCrossword(entries: WordEntry[]): Placement[] | null {
  const grid: (string | null)[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  const placements: Placement[] = [];

  for (let wi = 0; wi < entries.length; wi++) {
    const entry = entries[wi];
    const word = entry.word;
    const isFirst = placements.length === 0;

    if (isFirst) {
      // Place first word horizontally in the middle
      const row = Math.floor(GRID_SIZE / 2);
      const col = Math.floor((GRID_SIZE - word.length) / 2);
      if (canPlace(grid, word, row, col, "across", true)) {
        placeWord(grid, word, row, col, "across");
        placements.push({ entry, row, col, dir: "across", number: 1 });
      }
      continue;
    }

    // Try to intersect with any already-placed word
    let placed = false;
    const triedDirs: ("across" | "down")[] = placements[placements.length - 1].dir === "across"
      ? ["down", "across"] : ["across", "down"];

    for (const dir of triedDirs) {
      if (placed) break;
      for (const existing of placements) {
        if (placed) break;
        for (let wi2 = 0; wi2 < word.length; wi2++) {
          if (placed) break;
          for (let ei = 0; ei < existing.entry.word.length; ei++) {
            if (word[wi2] !== existing.entry.word[ei]) continue;
            const dr = dir === "down" ? 1 : 0;
            const dc = dir === "across" ? 1 : 0;
            const edr = existing.dir === "down" ? 1 : 0;
            const edc = existing.dir === "across" ? 1 : 0;
            const row = existing.row + edr * ei - dr * wi2;
            const col = existing.col + edc * ei - dc * wi2;
            if (canPlace(grid, word, row, col, dir, false)) {
              placeWord(grid, word, row, col, dir);
              placements.push({ entry, row, col, dir, number: placements.length + 1 });
              placed = true;
              break;
            }
          }
        }
      }
    }
  }

  return placements.length >= 2 ? placements : null;
}

/** Compute the bounding box and assign clue numbers */
function buildPuzzle(placements: Placement[]): {
  grid: GridCell[][];
  across: Placement[];
  down: Placement[];
  numberedCells: Map<string, number>;
  minRow: number; minCol: number;
} {
  // Find bounding box
  let minRow = GRID_SIZE, maxRow = 0, minCol = GRID_SIZE, maxCol = 0;
  for (const p of placements) {
    const endRow = p.dir === "down" ? p.row + p.entry.word.length - 1 : p.row;
    const endCol = p.dir === "across" ? p.col + p.entry.word.length - 1 : p.col;
    minRow = Math.min(minRow, p.row); maxRow = Math.max(maxRow, endRow);
    minCol = Math.min(minCol, p.col); maxCol = Math.max(maxCol, endCol);
  }

  const rows = maxRow - minRow + 1;
  const cols = maxCol - minCol + 1;
  const grid: GridCell[][] = Array.from({ length: rows }, () => Array(cols).fill(null));

  // Fill grid cells
  for (const p of placements) {
    for (let i = 0; i < p.entry.word.length; i++) {
      const r = p.row - minRow + (p.dir === "down" ? i : 0);
      const c = p.col - minCol + (p.dir === "across" ? i : 0);
      if (!grid[r][c]) grid[r][c] = { letter: p.entry.word[i], placements: [] };
      (grid[r][c] as { letter: string; placements: number[] }).placements.push(placements.indexOf(p));
    }
  }

  // Number cells: cells that start an across or down word get a number
  const numberedCells = new Map<string, number>();
  let num = 1;
  const across: Placement[] = [];
  const down: Placement[] = [];

  // Sort placements by row then col to assign numbers correctly
  const sorted = [...placements].sort((a, b) =>
    (a.row - minRow) * 100 + (a.col - minCol) - ((b.row - minRow) * 100 + (b.col - minCol))
  );

  for (const p of sorted) {
    const r = p.row - minRow;
    const c = p.col - minCol;
    const key = `${r},${c}`;
    if (!numberedCells.has(key)) {
      numberedCells.set(key, num++);
    }
    const clueNum = numberedCells.get(key)!;
    const withNum = { ...p, number: clueNum };
    if (p.dir === "across") across.push(withNum);
    else down.push(withNum);
  }

  return { grid, across, down, numberedCells, minRow, minCol };
}

// ── Game state types ──────────────────────────────────────────────────────────

type UserGrid = (string | null)[][];

function crosswordKey(league: string, day: number) { return `partix:xwd:${league}:${SEASON_SEED}:${day}`; }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CrosswordPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const dayNum = getDayNum();
  const { status: authStatus } = useSession();

  const [placements,    setPlacements]    = useState<Placement[] | null>(null);
  const [puzzle,        setPuzzle]        = useState<ReturnType<typeof buildPuzzle> | null>(null);
  const [userGrid,      setUserGrid]      = useState<UserGrid>([]);
  const [activeCell,    setActiveCell]    = useState<[number, number] | null>(null);
  const [activeDir,     setActiveDir]     = useState<"across" | "down">("across");
  const [checked,       setChecked]       = useState(false);
  const [solved,        setSolved]        = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [noData,        setNoData]        = useState(false);

  // Load data and generate puzzle
  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/players`).then(r => r.json()),
      fetch(`/api/stats?league=${slug}&season=all&type=combined`).then(r => r.json()),
      fetch(`/api/stats/seasons?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then(r => r.json()),
      fetch(`/api/accolades?league=${slug}`).then(r => r.json()),
    ]).then(([players, stats, seasons, playerTeams, accolades]) => {
      const playersArr: RawPlayer[]       = Array.isArray(players)     ? players     : [];
      const statsArr:   StatRow[]         = Array.isArray(stats)       ? stats       : [];
      const sznArr:     SeasonRow[]       = Array.isArray(seasons)     ? seasons     : [];
      const ptArr:      PlayerTeamEntry[] = Array.isArray(playerTeams) ? playerTeams : [];
      const accsArr:    Accolade[]        = Array.isArray(accolades)   ? accolades   : [];

      const statsMap: Record<string, StatRow> = {};
      const ringMap:  Record<string, number>  = {};
      for (const s of statsArr) statsMap[s.mc_uuid] = s;
      for (const a of accsArr) { if (a.type === "Finals Champion") ringMap[a.mc_uuid] = (ringMap[a.mc_uuid] ?? 0) + 1; }

      const maxSznPPG: Record<string, number> = {};
      const maxPOPPG:  Record<string, number> = {};
      for (const row of sznArr) {
        const isPO = row.season?.toLowerCase().includes("playoff");
        if (!isPO && row.ppg != null) maxSznPPG[row.mc_uuid] = Math.max(maxSznPPG[row.mc_uuid] ?? 0, row.ppg);
        if (isPO  && row.ppg != null) maxPOPPG[row.mc_uuid]  = Math.max(maxPOPPG[row.mc_uuid]  ?? 0, row.ppg);
      }

      const leagueUuids = new Set([
        ...ptArr.map(pt => pt.mc_uuid),
        ...statsArr.map(s => s.mc_uuid),
      ]);

      // Filter to alpha-only names (3–9 chars) for crossword words
      const candidates = playersArr
        .filter(p => leagueUuids.has(p.mc_uuid) && /^[a-zA-Z]{3,9}$/.test(p.mc_username))
        .map(p => ({
          ...p,
          word: p.mc_username.toUpperCase(),
          clues: buildClues(p.mc_username, statsMap[p.mc_uuid], ringMap[p.mc_uuid] ?? 0,
            getMostRecentTeam(p.mc_uuid, ptArr), maxSznPPG[p.mc_uuid] ?? 0, maxPOPPG[p.mc_uuid] ?? 0),
        }));

      if (candidates.length < 2) { setNoData(true); setLoading(false); return; }

      // Shuffle for daily variety, then prefer sweet-spot word lengths (5–8)
      const rng = seededRng((SEASON_SEED + dayNum) * 79 + 3);
      const shuffledCands = shuffled(candidates, rng);
      const sweetSpot = (len: number) => len >= 5 && len <= 8 ? 0 : 1;
      shuffledCands.sort((a, b) => {
        const sa = sweetSpot(a.word.length), sb = sweetSpot(b.word.length);
        if (sa !== sb) return sa - sb;
        return Math.abs(a.word.length - 6) - Math.abs(b.word.length - 6);
      });

      // Pick up to 10 candidates with unique clues (try each clue slot, skip if already used)
      const usedClues = new Set<string>();
      const entries: WordEntry[] = [];
      for (const c of shuffledCands) {
        if (entries.length >= 10) break;
        // Find first clue for this player that hasn't been used yet
        const clue = c.clues.find(cl => !usedClues.has(cl));
        if (!clue) continue; // all their clues are taken — skip
        usedClues.add(clue);
        entries.push({ word: c.word, clue, mc_uuid: c.mc_uuid, username: c.mc_username });
      }

      const ps = generateCrossword(entries);
      if (!ps) { setNoData(true); setLoading(false); return; }

      const puz = buildPuzzle(ps);
      setPlacements(ps);
      setPuzzle(puz);

      // Init or restore user grid
      const rows = puz.grid.length;
      const cols = puz.grid[0].length;
      const savedRaw = localStorage.getItem(crosswordKey(slug, dayNum));
      if (savedRaw) {
        try { setUserGrid(JSON.parse(savedRaw)); } catch { setUserGrid(Array.from({ length: rows }, () => Array(cols).fill(null))); }
      } else {
        setUserGrid(Array.from({ length: rows }, () => Array(cols).fill(null)));
      }
      setLoading(false);
    });
  }, [slug, dayNum]);

  // Persist user grid
  useEffect(() => {
    if (!puzzle || userGrid.length === 0) return;
    localStorage.setItem(crosswordKey(slug, dayNum), JSON.stringify(userGrid));
    // Check if solved
    if (checked) {
      let allCorrect = true;
      for (let r = 0; r < puzzle.grid.length; r++) {
        for (let c = 0; c < puzzle.grid[0].length; c++) {
          if (puzzle.grid[r][c] !== null) {
            if (userGrid[r]?.[c] !== puzzle.grid[r][c]!.letter) { allCorrect = false; break; }
          }
        }
        if (!allCorrect) break;
      }
      setSolved(allCorrect);
    }
  }, [userGrid, puzzle, checked, slug, dayNum]);

  const getCellPlacements = useCallback((r: number, c: number): Placement[] => {
    if (!placements || !puzzle) return [];
    return (puzzle.grid[r][c] as { letter: string; placements: number[] } | null)?.placements
      .map(i => placements[i]) ?? [];
  }, [placements, puzzle]);

  const moveToNext = useCallback((r: number, c: number, dir: "across" | "down", reverse = false) => {
    if (!puzzle) return;
    const dr = dir === "down" ? (reverse ? -1 : 1) : 0;
    const dc = dir === "across" ? (reverse ? -1 : 1) : 0;
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < puzzle.grid.length && nc >= 0 && nc < puzzle.grid[0].length) {
      if (puzzle.grid[nr][nc] !== null) { setActiveCell([nr, nc]); return; }
      nr += dr; nc += dc;
    }
  }, [puzzle]);

  const handleKey = useCallback((r: number, c: number, key: string) => {
    if (!puzzle) return;
    if (/^[a-zA-Z]$/.test(key)) {
      setUserGrid(prev => {
        const next = prev.map(row => [...row]);
        next[r][c] = key.toUpperCase();
        return next;
      });
      moveToNext(r, c, activeDir);
    } else if (key === "Backspace") {
      setUserGrid(prev => {
        const next = prev.map(row => [...row]);
        if (prev[r][c]) { next[r][c] = null; }
        else { moveToNext(r, c, activeDir, true); }
        return next;
      });
      if (!userGrid[r]?.[c]) moveToNext(r, c, activeDir, true);
    } else if (key === "ArrowRight") { setActiveDir("across"); moveToNext(r, c, "across"); }
    else if (key === "ArrowLeft")  { setActiveDir("across"); moveToNext(r, c, "across", true); }
    else if (key === "ArrowDown")  { setActiveDir("down");   moveToNext(r, c, "down"); }
    else if (key === "ArrowUp")    { setActiveDir("down");   moveToNext(r, c, "down", true); }
  }, [puzzle, activeDir, moveToNext, userGrid]);

  const handleCheck = () => {
    setChecked(true);
    if (!puzzle) return;
    let allCorrect = true;
    for (let r = 0; r < puzzle.grid.length; r++) {
      for (let c = 0; c < puzzle.grid[0].length; c++) {
        if (puzzle.grid[r][c] !== null) {
          if (userGrid[r]?.[c] !== puzzle.grid[r][c]!.letter) { allCorrect = false; break; }
        }
      }
      if (!allCorrect) break;
    }
    setSolved(allCorrect);
  };

  const handleReveal = () => {
    if (!puzzle) return;
    const next = puzzle.grid.map(row =>
      row.map(cell => cell ? cell.letter : null)
    );
    setUserGrid(next);
    setChecked(true);
    setSolved(true);
  };

  // ── Discord gate ──────────────────────────────────────────────────────────

  if (authStatus === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 className="text-2xl font-bold text-white">Mini Crossword</h2>
          <p className="text-slate-400 text-sm mt-0.5">Day #{dayNum} · Fill in the player names</p>
        </div>
        <div className="p-12 flex flex-col items-center gap-5 text-center">
          <div className="text-5xl">🔐</div>
          <div>
            <p className="text-white font-semibold text-lg">Sign in to play</p>
            <p className="text-slate-400 text-sm mt-1">Discord login is required to track your daily result.</p>
          </div>
          <button onClick={() => signIn("discord")}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 transition">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.017.012.033.026.044a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Sign in with Discord
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const activePlacementIndices = activeCell && puzzle
    ? getCellPlacements(activeCell[0], activeCell[1]).map(p => placements!.indexOf(p))
    : [];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white">Mini Crossword</h2>
          <p className="text-slate-400 text-sm mt-0.5">Day #{dayNum} · Fill in the player names</p>
        </div>
        {solved && <span className="text-green-400 font-semibold text-sm">🎉 Solved!</span>}
      </div>

      {loading || authStatus === "loading" ? (
        <div className="p-10 text-center text-slate-500">Building today's crossword...</div>
      ) : noData ? (
        <div className="p-10 text-center text-slate-500">
          Not enough alpha-only player names to build a crossword yet.
          <p className="text-xs mt-2 text-slate-600">Players need usernames made of only letters (no numbers or underscores).</p>
        </div>
      ) : puzzle ? (
        <div className="p-4 flex flex-col lg:flex-row gap-6">
          {/* Grid */}
          <div className="flex-shrink-0">
            <div
              className="inline-grid gap-0.5"
              style={{ gridTemplateColumns: `repeat(${puzzle.grid[0].length}, minmax(0,1fr))` }}
            >
              {puzzle.grid.map((row, r) =>
                row.map((cell, c) => {
                  if (!cell) {
                    return <div key={`${r}-${c}`} className="w-8 h-8 bg-slate-950 rounded-sm" />;
                  }
                  const cellKey = `${r},${c}`;
                  const clueNum = puzzle.numberedCells.get(cellKey);
                  const isActive = activeCell?.[0] === r && activeCell?.[1] === c;
                  const isHighlighted = activeCell && !isActive && getCellPlacements(r, c).some(p => {
                    const pi = placements!.indexOf(p);
                    return activePlacementIndices.includes(pi) && p.dir === activeDir;
                  });
                  const userLetter = userGrid[r]?.[c] ?? "";
                  const isCorrect = checked && userLetter === cell.letter;
                  const isWrong   = checked && userLetter !== "" && userLetter !== cell.letter;

                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`w-8 h-8 relative border cursor-pointer select-none
                        ${isActive    ? "border-blue-500 bg-blue-900"    :
                          isHighlighted ? "border-blue-400 bg-blue-950/60" :
                          isCorrect   ? "border-green-700 bg-green-950"  :
                          isWrong     ? "border-red-700 bg-red-950"      :
                                        "border-slate-600 bg-slate-800"  }
                        rounded-sm`}
                      onClick={() => {
                        if (isActive) setActiveDir(d => d === "across" ? "down" : "across");
                        else setActiveCell([r, c]);
                      }}
                      onKeyDown={e => handleKey(r, c, e.key)}
                      tabIndex={0}
                    >
                      {clueNum && (
                        <span className="absolute top-0 left-0.5 text-[7px] text-slate-400 leading-none font-bold">{clueNum}</span>
                      )}
                      <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold uppercase
                        ${isCorrect ? "text-green-300" : isWrong ? "text-red-300" : "text-white"}`}>
                        {userLetter}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2 mt-3">
              <button onClick={handleCheck}
                className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 transition">
                Check
              </button>
              <button onClick={handleReveal}
                className="rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-white text-sm px-4 py-2 transition">
                Reveal All
              </button>
            </div>
          </div>

          {/* Clues */}
          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {puzzle.across.length > 0 && (
              <div>
                <h3 className="text-slate-300 font-semibold text-sm mb-2 uppercase tracking-wider">Across</h3>
                <div className="space-y-2">
                  {puzzle.across.map(p => (
                    <div key={p.number}
                      className={`cursor-pointer rounded-lg px-3 py-2 text-sm transition
                        ${activePlacementIndices.includes(placements!.indexOf(p)) && activeDir === "across"
                          ? "bg-blue-950 border border-blue-800 text-white"
                          : "bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600"}`}
                      onClick={() => {
                        const r = p.row - puzzle.minRow;
                        const c = p.col - puzzle.minCol;
                        setActiveCell([r, c]);
                        setActiveDir("across");
                      }}>
                      <span className="font-bold text-slate-400 mr-1.5">{p.number}.</span>
                      {p.entry.clue}
                      <span className="text-slate-600 ml-1">({p.entry.word.length})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {puzzle.down.length > 0 && (
              <div>
                <h3 className="text-slate-300 font-semibold text-sm mb-2 uppercase tracking-wider">Down</h3>
                <div className="space-y-2">
                  {puzzle.down.map(p => (
                    <div key={p.number}
                      className={`cursor-pointer rounded-lg px-3 py-2 text-sm transition
                        ${activePlacementIndices.includes(placements!.indexOf(p)) && activeDir === "down"
                          ? "bg-blue-950 border border-blue-800 text-white"
                          : "bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600"}`}
                      onClick={() => {
                        const r = p.row - puzzle.minRow;
                        const c = p.col - puzzle.minCol;
                        setActiveCell([r, c]);
                        setActiveDir("down");
                      }}>
                      <span className="font-bold text-slate-400 mr-1.5">{p.number}.</span>
                      {p.entry.clue}
                      <span className="text-slate-600 ml-1">({p.entry.word.length})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
