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
type Slot = "PG" | "SG" | "SF" | "PF" | "C";

const SLOTS: Slot[] = ["PG", "SG", "SF", "PF", "C"];
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
  const stocks = (p.spg ?? 0) + (p.bpg ?? 0);
  const shooting = p.fg_pct != null ? (p.fg_pct - 45) * 0.12 : 0;
  const three = p.three_pt_pct != null ? (p.three_pt_pct - 32) * 0.06 : 0;
  const turnovers = p.topg ?? 0;
  const vorp = p.vorp ?? 0;
  return scoring * 2.15 + boards * 1.15 + passing * 1.65 + stocks * 4.25 + shooting + three + vorp * 5.5 - turnovers * 2.4;
}

function calculateRecord(picks: Pick[]) {
  if (picks.length < 5) return { wins: 0, losses: 0, ovr: 0 };

  const raw = picks.reduce((sum, p) => sum + playerScore(p), 0);
  const avgVorp = picks.reduce((sum, p) => sum + (p.vorp ?? 0), 0) / picks.length;
  const teamCount = new Set(picks.map((p) => p.team?.id).filter(Boolean)).size;
  const seasonSpread = new Set(picks.map((p) => p.season)).size;
  const balanceBonus = Math.min(6, teamCount * 0.8 + seasonSpread * 0.45);
  const weakLinkPenalty = Math.max(0, 22 - Math.min(...picks.map(playerScore))) * 0.85;
  const ovr = Math.max(35, Math.min(110, raw / 3.1 + avgVorp * 2.2 + balanceBonus - weakLinkPenalty));
  const wins = Math.max(12, Math.min(82, Math.round(82 * Math.pow(ovr / 110, 1.85))));
  return { wins, losses: 82 - wins, ovr: Math.round(ovr) };
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
  const [selectedSlot, setSelectedSlot] = React.useState<Slot>("PG");
  const [picks, setPicks] = React.useState<Pick[]>([]);
  const [started, setStarted] = React.useState(false);

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
          const res = await fetch(`/api/stats?league=${league}&season=${encodeURIComponent(season)}&type=regular`);
          const rows = await res.json().catch(() => []);
          return Array.isArray(rows)
            ? rows
                .filter((row: StatRow) => row.mc_uuid && row.mc_username && row.team?.id && (row.gp ?? 0) > 0)
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
        setRoundPools(shuffle(validPools, day * 820 + league.length).slice(0, 5));
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
  const complete = picks.length === 5;
  const options = React.useMemo(() => {
    if (!currentPool) return [];
    const alreadyPicked = new Set(picks.map((pick) => pick.mc_uuid));
    const poolPlayers = currentPool.players.filter((player) => !alreadyPicked.has(player.mc_uuid));
    return shuffle(poolPlayers.slice(0, 10), day * 1000 + round * 17).slice(0, 6);
  }, [currentPool, day, picks, round]);

  const start = () => {
    const fresh = shuffle(pools, Date.now() % 100000).slice(0, 5);
    setRoundPools(fresh.length >= 5 ? fresh : roundPools);
    setPicks([]);
    setRound(0);
    setSelectedSlot("PG");
    setStarted(true);
  };

  const draft = (player: StatRow) => {
    if (!openSlots.includes(selectedSlot)) return;
    setPicks((prev) => [...prev, { ...player, slot: selectedSlot }]);
    const nextSlots = openSlots.filter((slot) => slot !== selectedSlot);
    setSelectedSlot(nextSlots[0] ?? "PG");
    setRound((prev) => prev + 1);
  };

  const reset = () => {
    setStarted(false);
    setPicks([]);
    setRound(0);
    setSelectedSlot("PG");
    setRoundPools(shuffle(pools, day * 820 + Math.floor(Math.random() * 1000)).slice(0, 5));
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
              Draft five Minecraft Basketball starters from random team and season pools. Stats are hidden until the final record.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950 px-5 py-3 text-right">
            <div className="text-3xl font-black text-amber-300">{complete ? `${result.wins}-${result.losses}` : `${picks.length}/5`}</div>
            <div className="text-xs font-black uppercase tracking-widest text-slate-500">{complete ? "record" : "lineup"}</div>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-10 text-center text-slate-500">Loading player pools...</div>
        ) : error ? (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-10 text-center text-red-200">{error}</div>
        ) : pools.length < 5 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-10 text-center text-slate-500">
            Not enough season/team stat pools yet.
          </div>
        ) : !started ? (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">How it works</div>
              <h3 className="mt-3 text-2xl font-black text-white">Build a five-man lineup from your league history.</h3>
              <div className="mt-5 grid gap-3 text-sm text-slate-300">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">Each round gives you one team and one season.</div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">Pick one player without seeing the raw box-score stats.</div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">Fill PG, SG, SF, PF, and C, then get an 82-game projection.</div>
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
              <div className="mt-6 grid grid-cols-5 gap-2">
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
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Round {round + 1} of 5</div>
              <div className="mt-5 flex items-center gap-4">
                <TeamLogo team={currentPool.team} />
                <div>
                  <div className="text-xl font-black text-white">{currentPool.team.name}</div>
                  <div className="text-sm font-bold text-slate-500">{currentPool.season}</div>
                </div>
              </div>

              <div className="mt-7 text-xs font-black uppercase tracking-widest text-slate-500">Choose slot</div>
              <div className="mt-3 grid grid-cols-5 gap-2 xl:grid-cols-1">
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
                {options.map((player) => (
                  <button
                    key={player.mc_uuid}
                    type="button"
                    onClick={() => draft(player)}
                    className="flex min-h-24 items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-red-500 hover:bg-slate-900"
                  >
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
