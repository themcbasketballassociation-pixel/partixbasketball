"use client";

import Link from "next/link";
import React from "react";

type Team = { id: string; name: string; abbreviation: string; logo_url?: string | null };
type SeasonMeta = { season?: string };
type StatRow = {
  mc_uuid: string;
  mc_username: string;
  season: string;
  gp: number;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  fg_pct: number | null;
  three_pt_pct: number | null;
  topg: number | null;
  vorp: number | null;
  team?: Team | null;
};

type Pool = {
  key: string;
  team: Team;
  season: string;
  players: StatRow[];
};

type Pick = StatRow & { slot: Slot };
type Slot = "#1" | "#2" | "#3" | "Bench";

const SLOTS: Slot[] = ["#1", "#2", "#3", "Bench"];
const EPOCH_MS = new Date("2026-04-13T14:00:00Z").getTime();

function getDayNum() {
  return Math.max(1, Math.floor((Date.now() - EPOCH_MS) / 86400000) + 1);
}

function seasonNumber(season: string) {
  return parseInt(season.match(/\d+/)?.[0] ?? "0", 10);
}

function seededRng(seed: number) {
  let s = seed | 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffle<T>(items: T[], seed: number) {
  const rng = seededRng(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function playerScore(p: StatRow) {
  const scoring = p.ppg ?? 0;
  const boards = p.rpg ?? 0;
  const passing = p.apg ?? 0;
  const steals = p.spg ?? 0;
  const blocks = p.bpg ?? 0;
  const shooting = p.fg_pct != null ? (p.fg_pct - 45) * 0.18 : 0;
  const three = p.three_pt_pct != null ? (p.three_pt_pct - 32) * 0.1 : 0;
  const turnovers = p.topg ?? 0;
  const vorp = p.vorp ?? 0;
  return scoring * 1.45 + boards * 2.55 + passing * 3.25 + steals * 7.25 + blocks * 6.4 + shooting + three + vorp * 1.5 - turnovers * 3;
}

function slotWeight(slot: Slot) {
  return slot === "Bench" ? 0.62 : 1;
}

function calculateRecord(picks: Pick[]) {
  if (picks.length < SLOTS.length) return { wins: 0, losses: 0, ovr: 0, scoring: 0, rebounding: 0, playmaking: 0, defense: 0, efficiency: 0 };

  const totalWeight = picks.reduce((sum, pick) => sum + slotWeight(pick.slot), 0);
  const avg = (fn: (pick: Pick) => number) => picks.reduce((sum, pick) => sum + fn(pick) * slotWeight(pick.slot), 0) / totalWeight;
  const scoring = avg((p) => p.ppg ?? 0);
  const rebounding = avg((p) => p.rpg ?? 0);
  const playmaking = avg((p) => p.apg ?? 0);
  const defense = avg((p) => (p.spg ?? 0) * 1.35 + (p.bpg ?? 0) * 1.2);
  const efficiency = avg((p) => {
    const fg = p.fg_pct != null ? (p.fg_pct - 42) / 3.2 : 0;
    const three = p.three_pt_pct != null ? (p.three_pt_pct - 30) / 5 : 0;
    return fg + three - (p.topg ?? 0) * 0.75;
  });
  const avgVorp = avg((p) => p.vorp ?? 0);
  const teamCount = new Set(picks.map((p) => p.team?.id).filter(Boolean)).size;
  const seasonSpread = new Set(picks.map((p) => p.season)).size;
  const balanceBonus = Math.min(3, teamCount * 0.25 + seasonSpread * 0.2);
  const starterScores = picks.filter((p) => p.slot !== "Bench").map(playerScore);
  const bench = picks.find((p) => p.slot === "Bench");
  const benchScore = bench ? playerScore(bench) : 0;
  const benchProduction = bench ? (bench.ppg ?? 0) + (bench.rpg ?? 0) * 1.4 + (bench.apg ?? 0) * 1.6 + (bench.spg ?? 0) * 4 + (bench.bpg ?? 0) * 3.5 + (bench.vorp ?? 0) * 2 : 0;
  const weakestStarter = Math.min(...starterScores);
  const weakLinkPenalty = Math.max(0, 50 - weakestStarter) * 1.5 + Math.max(0, 30 - benchScore) * 1.15;
  const categoryPenalty =
    Math.max(0, 19 - scoring) * 1.9 +
    Math.max(0, 7.2 - rebounding) * 7.2 +
    Math.max(0, 5.2 - playmaking) * 7.8 +
    Math.max(0, 3.0 - defense) * 12 +
    Math.max(0, 1.8 - efficiency) * 5.5 +
    Math.max(0, 3.2 - avgVorp) * 2.2 +
    Math.max(0, 22 - benchProduction) * 1.8;
  const starPower = picks.reduce((sum, p) => sum + playerScore(p) * slotWeight(p.slot), 0) / totalWeight;
  const ovr = Math.max(
    35,
    Math.min(
      110,
      starPower * 0.5 +
        scoring * 0.85 +
        rebounding * 4.2 +
        playmaking * 4.7 +
        defense * 9.8 +
        efficiency * 2.6 +
        avgVorp * 1.3 +
        balanceBonus -
        weakLinkPenalty -
        categoryPenalty
    )
  );
  const baseWins = Math.max(8, Math.min(82, Math.round(82 * Math.pow(ovr / 118, 3.1))));
  const ceilings = [
    scoring >= 23 ? 82 : scoring >= 20 ? 79 : scoring >= 17 ? 74 : 68,
    rebounding >= 8.2 ? 82 : rebounding >= 7 ? 78 : rebounding >= 5.8 ? 72 : 66,
    playmaking >= 6.2 ? 82 : playmaking >= 5 ? 78 : playmaking >= 4 ? 72 : 65,
    defense >= 3.4 ? 82 : defense >= 2.8 ? 78 : defense >= 2.2 ? 72 : 64,
    efficiency >= 2.8 ? 82 : efficiency >= 1.4 ? 78 : efficiency >= 0 ? 72 : 66,
    avgVorp >= 5 ? 82 : avgVorp >= 3.5 ? 79 : avgVorp >= 2 ? 74 : 68,
    weakestStarter >= 62 ? 82 : weakestStarter >= 52 ? 78 : weakestStarter >= 44 ? 72 : 64,
    benchProduction >= 45 ? 82 : benchProduction >= 32 ? 76 : benchProduction >= 22 ? 68 : benchProduction >= 12 ? 60 : 52,
  ];
  const wins = Math.min(baseWins, ...ceilings);
  return {
    wins,
    losses: 82 - wins,
    ovr: Math.round(ovr),
    scoring: Math.round(scoring * 10) / 10,
    rebounding: Math.round(rebounding * 10) / 10,
    playmaking: Math.round(playmaking * 10) / 10,
    defense: Math.round(defense * 10) / 10,
    efficiency: Math.round(efficiency * 10) / 10,
  };
}

function grade(wins: number) {
  if (wins >= 82) return "Perfect";
  if (wins >= 75) return "Title favorite";
  if (wins >= 65) return "Contender";
  if (wins >= 52) return "Playoff team";
  return "Lottery build";
}

function TeamLogo({ team }: { team?: Team | null }) {
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-950">
      {team?.logo_url ? (
        <img src={team.logo_url} alt="" className="h-9 w-9 object-contain" />
      ) : (
        <span className="text-xs font-black text-slate-500">{team?.abbreviation ?? "FA"}</span>
      )}
    </span>
  );
}

export default function EightyTwoOhPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const league = resolved.league ?? "mba";
  const day = getDayNum();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [pools, setPools] = React.useState<Pool[]>([]);
  const [roundPools, setRoundPools] = React.useState<Pool[]>([]);
  const [round, setRound] = React.useState(0);
  const [selectedSlot, setSelectedSlot] = React.useState<Slot>("#1");
  const [picks, setPicks] = React.useState<Pick[]>([]);
  const [started, setStarted] = React.useState(false);
  const [teamRerollUsed, setTeamRerollUsed] = React.useState(false);
  const [eraRerollUsed, setEraRerollUsed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      const seasonsRes = await fetch(`/api/stats/seasons?league=${league}`);
      const seasonsData = await seasonsRes.json().catch(() => []);
      const seasons = Array.isArray(seasonsData)
        ? [...new Set(
            seasonsData
              .map((s: SeasonMeta) => s.season)
              .filter((s: string | undefined): s is string => !!s && !s.toLowerCase().includes("playoff"))
          )].sort((a, b) => seasonNumber(b) - seasonNumber(a))
        : [];

      const fetched = await Promise.all(
        seasons.map(async (season) => {
          const [statsRes, teamsRes] = await Promise.all([
            fetch(`/api/stats?league=${league}&season=${encodeURIComponent(season)}&type=regular&strictTeamSeason=1`),
            fetch(`/api/teams?league=${league}&season=${encodeURIComponent(season)}`),
          ]);
          const rows = await statsRes.json().catch(() => []);
          const teams = await teamsRes.json().catch(() => []);
          const validTeamIds = new Set(
            Array.isArray(teams)
              ? teams.map((team: Team) => team.id).filter((id: string | undefined): id is string => !!id)
              : []
          );
          return Array.isArray(rows)
            ? rows
                .filter((row: StatRow) => row.mc_uuid && row.mc_username && row.team?.id && validTeamIds.has(row.team.id) && (row.gp ?? 0) > 0)
                .map((row: StatRow) => ({ ...row, season }))
            : [];
        })
      );

      const byPool = new Map<string, Pool>();
      for (const row of fetched.flat()) {
        if (!row.team) continue;
        const key = `${row.team.id}:${row.season}`;
        const existing = byPool.get(key);
        if (existing) {
          existing.players.push(row);
        } else {
          byPool.set(key, { key, team: row.team, season: row.season, players: [row] });
        }
      }

      const validPools = [...byPool.values()]
        .map((pool) => ({ ...pool, players: [...pool.players].sort((a, b) => playerScore(b) - playerScore(a)) }))
        .filter((pool) => pool.players.length >= 2);

      if (!cancelled) {
        setPools(validPools);
        setRoundPools(shuffle(validPools, day * 820 + league.length).slice(0, SLOTS.length));
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setError("Could not load player pools.");
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [league, day]);

  const openSlots = SLOTS.filter((slot) => !picks.some((pick) => pick.slot === slot));
  const currentPool = roundPools[round] ?? null;
  const result = calculateRecord(picks);
  const complete = picks.length === SLOTS.length;
  const options = React.useMemo(() => {
    if (!currentPool) return [];
    const alreadyPicked = new Set(picks.map((pick) => pick.mc_uuid));
    const poolPlayers = currentPool.players.filter((player) => !alreadyPicked.has(player.mc_uuid));
    return shuffle(poolPlayers.slice(0, 10), day * 1000 + round * 17).slice(0, 6);
  }, [currentPool, day, picks, round]);
  const canTeamReroll = !!currentPool && pools.some((pool) => pool.season === currentPool.season && pool.team.id !== currentPool.team.id);
  const canEraReroll = !!currentPool && pools.some((pool) => pool.team.id === currentPool.team.id && pool.season !== currentPool.season);

  const start = () => {
    const fresh = shuffle(pools, Date.now() % 100000).slice(0, SLOTS.length);
    setRoundPools(fresh.length >= SLOTS.length ? fresh : roundPools);
    setPicks([]);
    setRound(0);
    setSelectedSlot("#1");
    setTeamRerollUsed(false);
    setEraRerollUsed(false);
    setStarted(true);
  };

  const draft = (player: StatRow) => {
    if (!openSlots.includes(selectedSlot)) return;
    setPicks((prev) => [...prev, { ...player, slot: selectedSlot }]);
    const nextSlots = openSlots.filter((slot) => slot !== selectedSlot);
    setSelectedSlot(nextSlots[0] ?? "#1");
    setRound((prev) => prev + 1);
  };

  const reset = () => {
    setStarted(false);
    setPicks([]);
    setRound(0);
    setSelectedSlot("#1");
    setTeamRerollUsed(false);
    setEraRerollUsed(false);
    setRoundPools(shuffle(pools, day * 820 + Math.floor(Math.random() * 1000)).slice(0, SLOTS.length));
  };

  const replaceCurrentPool = (replacement: Pool) => {
    setRoundPools((prev) => prev.map((pool, idx) => (idx === round ? replacement : pool)));
  };

  const rerollTeam = () => {
    if (!currentPool || teamRerollUsed) return;
    const usedKeys = new Set(roundPools.map((pool) => pool.key));
    const candidates = pools.filter((pool) => pool.season === currentPool.season && pool.team.id !== currentPool.team.id && !usedKeys.has(pool.key));
    const fallback = pools.filter((pool) => pool.season === currentPool.season && pool.team.id !== currentPool.team.id);
    const next = shuffle(candidates.length ? candidates : fallback, Date.now() % 100000)[0];
    if (!next) return;
    replaceCurrentPool(next);
    setTeamRerollUsed(true);
  };

  const rerollEra = () => {
    if (!currentPool || eraRerollUsed) return;
    const usedKeys = new Set(roundPools.map((pool) => pool.key));
    const candidates = pools.filter((pool) => pool.team.id === currentPool.team.id && pool.season !== currentPool.season && !usedKeys.has(pool.key));
    const fallback = pools.filter((pool) => pool.team.id === currentPool.team.id && pool.season !== currentPool.season);
    const next = shuffle(candidates.length ? candidates : fallback, Date.now() % 100000)[0];
    if (!next) return;
    replaceCurrentPool(next);
    setEraRerollUsed(true);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#090c12] shadow-xl">
      <div className="border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-950 to-red-950/30 px-5 py-5 sm:px-7">
        <Link href={`/${league}/games`} className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white">
          Back to games
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.25em] text-red-400">Hoop IQ Draft</div>
            <h2 className="mt-1 text-4xl font-black tracking-tight text-white">82-0</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Draft #1, #2, #3, and Bench from exact team-season pools. Stats are hidden until the final record.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950 px-5 py-3 text-right">
            <div className="text-3xl font-black text-amber-300">{complete ? `${result.wins}-${result.losses}` : `${picks.length}/${SLOTS.length}`}</div>
            <div className="text-xs font-black uppercase tracking-widest text-slate-500">{complete ? "record" : "lineup"}</div>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-10 text-center text-slate-500">Loading player pools...</div>
        ) : error ? (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-10 text-center text-red-200">{error}</div>
        ) : pools.length < SLOTS.length ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-10 text-center text-slate-500">
            Not enough season/team stat pools yet.
          </div>
        ) : !started ? (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">How it works</div>
              <h3 className="mt-3 text-2xl font-black text-white">Build a four-man lineup from your league history.</h3>
              <div className="mt-5 grid gap-3 text-sm text-slate-300">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">Each round gives you one team from one exact season.</div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">The choices are only players who had stats for that team in that season.</div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">You get one Team reroll and one Era reroll for the full draft.</div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">Scoring, boards, assists, steals, blocks, efficiency, and VORP all matter.</div>
              </div>
              <button
                type="button"
                onClick={start}
                className="mt-6 rounded-xl bg-red-600 px-6 py-3 text-sm font-black uppercase tracking-widest text-white transition hover:bg-red-500"
              >
                Start Hoop IQ
              </button>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Available pools</div>
              <div className="mt-4 text-5xl font-black text-white">{pools.length}</div>
              <div className="mt-1 text-sm text-slate-500">team-season groups loaded</div>
              <div className="mt-6 grid grid-cols-4 gap-2">
                {SLOTS.map((slot) => (
                  <div key={slot} className="rounded-lg border border-slate-800 bg-slate-900 py-3 text-center text-sm font-black text-slate-300">{slot}</div>
                ))}
              </div>
            </div>
          </div>
        ) : complete ? (
          <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
            <div className="rounded-2xl border border-amber-700/60 bg-amber-950/20 p-6 text-center">
              <div className="text-6xl font-black text-amber-300">{result.wins}-{result.losses}</div>
              <div className="mt-2 text-lg font-black text-white">{grade(result.wins)}</div>
              <div className="mt-1 text-sm text-slate-400">Team OVR {result.ovr}</div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-slate-300">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><b className="block text-white">{result.scoring}</b>Scoring</div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><b className="block text-white">{result.rebounding}</b>Rebounding</div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><b className="block text-white">{result.playmaking}</b>Assists</div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><b className="block text-white">{result.defense}</b>Defense</div>
              </div>
              <button type="button" onClick={reset} className="mt-6 rounded-xl bg-slate-800 px-5 py-3 text-sm font-black text-white hover:bg-slate-700">
                Draft again
              </button>
            </div>
            <div className="grid gap-3">
              {picks.map((pick) => (
                <div key={`${pick.slot}:${pick.mc_uuid}`} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 sm:grid-cols-[64px_1fr_auto] sm:items-center">
                  <div className="text-2xl font-black text-red-400">{pick.slot}</div>
                  <div className="flex min-w-0 items-center gap-3">
                    <img src={`https://minotar.net/avatar/${pick.mc_username}/42`} alt="" className="h-11 w-11 rounded-lg border border-slate-700 bg-slate-900" />
                    <div className="min-w-0">
                      <div className="truncate text-lg font-black text-white">{pick.mc_username}</div>
                      <div className="truncate text-xs font-bold uppercase tracking-widest text-slate-500">{pick.team?.abbreviation ?? "FA"} - {pick.season}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <span><b className="block text-white">{pick.ppg ?? "-"}</b><span className="text-slate-500">PPG</span></span>
                    <span><b className="block text-white">{pick.rpg ?? "-"}</b><span className="text-slate-500">RPG</span></span>
                    <span><b className="block text-white">{pick.apg ?? "-"}</b><span className="text-slate-500">APG</span></span>
                    <span><b className="block text-amber-300">{pick.vorp == null ? "-" : `+${pick.vorp}`}</b><span className="text-slate-500">VORP</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : currentPool ? (
          <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
            <aside className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Round {round + 1} of {SLOTS.length}</div>
              <div className="mt-5 flex items-center gap-4">
                <TeamLogo team={currentPool.team} />
                <div>
                  <div className="text-xl font-black text-white">{currentPool.team.name}</div>
                  <div className="text-sm font-bold text-slate-500">{currentPool.season}</div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={teamRerollUsed || !canTeamReroll}
                  onClick={rerollTeam}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-red-500 disabled:cursor-not-allowed disabled:border-slate-900 disabled:bg-slate-950 disabled:text-slate-700"
                >
                  Team {teamRerollUsed ? "Used" : "Reroll"}
                </button>
                <button
                  type="button"
                  disabled={eraRerollUsed || !canEraReroll}
                  onClick={rerollEra}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-red-500 disabled:cursor-not-allowed disabled:border-slate-900 disabled:bg-slate-950 disabled:text-slate-700"
                >
                  Era {eraRerollUsed ? "Used" : "Reroll"}
                </button>
              </div>

              <div className="mt-7 text-xs font-black uppercase tracking-widest text-slate-500">Choose slot</div>
              <div className="mt-3 grid grid-cols-4 gap-2 xl:grid-cols-1">
                {SLOTS.map((slot) => {
                  const taken = picks.some((pick) => pick.slot === slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={taken}
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-lg border px-3 py-3 text-sm font-black transition ${
                        taken
                          ? "border-slate-900 bg-slate-950 text-slate-700"
                          : selectedSlot === slot
                            ? "border-red-500 bg-red-950/40 text-white"
                            : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>

              <div className="mt-7 grid gap-2">
                {picks.map((pick) => (
                  <div key={`${pick.slot}:side`} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs">
                    <span className="font-black text-slate-400">{pick.slot}</span>
                    <span className="font-bold text-white">{pick.mc_username}</span>
                  </div>
                ))}
              </div>
            </aside>

            <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-red-400">Stats hidden</div>
                  <h3 className="mt-1 text-2xl font-black text-white">Pick one player</h3>
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Slot: {selectedSlot}</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {options.map((player, idx) => (
                  <button
                    key={player.mc_uuid}
                    type="button"
                    onClick={() => draft(player)}
                    className="flex min-h-24 items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-red-500 hover:bg-slate-900"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-red-500/40 bg-red-950/30 text-sm font-black text-red-200">
                      #{idx + 1}
                    </span>
                    <img src={`https://minotar.net/avatar/${player.mc_username}/52`} alt="" className="h-14 w-14 rounded-xl border border-slate-700 bg-slate-950" />
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-black text-white">{player.mc_username}</span>
                      <span className="mt-1 block text-xs font-bold uppercase tracking-widest text-slate-500">{currentPool.team.abbreviation} - {currentPool.season}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
